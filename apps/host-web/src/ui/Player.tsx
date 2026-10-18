import { useEffect, useRef, useState } from 'react';
import { MenuAction, TransportLabel } from '@couch/protocol';
import { getSystem } from '@couch/systems';
import { Engine } from '../engine/engine.js';
import { onNav } from '../focus/focus.js';
import { coreFor, type HostSettings } from '../host-settings.js';
import { biosFiles, gameFiles, listSaves, readSave, touchRecent, writeSave, type Game, type SaveSlot } from '../library/library.js';
import type { HostSession, SessionView } from '../net/host-session.js';
import { PlayerChip } from './common.js';

interface Props {
  game: Game;
  resume: boolean;
  settings: HostSettings;
  session: HostSession;
  view: SessionView;
  onExit: () => void;
  setNavEnabled: (on: boolean) => void;
}

type MenuPage = 'main' | 'save' | 'load' | 'players';

export function Player({ game, resume, settings, session, view, onExit, setNavEnabled }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading');
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<MenuPage | null>(null);
  const [saves, setSaves] = useState<SaveSlot[]>([]);
  const [overlay, setOverlay] = useState(settings.latencyOverlay);
  const [toast, setToast] = useState<string | null>(null);
  const [stats, setStats] = useState({ fps: 0, frameMs: 0 });
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const menuRef = useRef<MenuPage | null>(null);
  menuRef.current = menu;
  const viewRef = useRef(view);
  viewRef.current = view;
  const sys = getSystem(game.system)!;

  const refreshSaves = async () => setSaves(await listSaves(game.id));

  const broadcastState = (m: MenuPage | null, s: SaveSlot[]) =>
    session.setHostState(m ? 'menu' : 'game', !!m, s.filter((x) => x.slot !== 'auto').map((x) => x.slot as number));

  // Launch.
  useEffect(() => {
    let alive = true;
    session.setSkin(sys.skin, game.title);
    touchRecent(game.id);
    setNavEnabled(false);
    (async () => {
      try {
        const files = await gameFiles(game);
        const bios = await biosFiles(game.system);
        const auto = resume ? await readSave(game.id, 'auto') : undefined;
        const engine = new Engine({
          system: sys,
          core: coreFor(sys, settings),
          backend: sys.web!.backend,
          files,
          bios,
          stage: stageRef.current!,
          players: settings.maxPlayers,
          runAhead: settings.runAhead,
          onRumble: (port, strong, weak, ms) => session.rumble(port, strong, weak, ms),
          ...(auto ? { state: auto.state } : {}),
        });
        engineRef.current = engine;
        await engine.launch();
        if (!alive) return void engine.exit();
        // Apply whatever the phones are holding right now.
        for (const p of session.players) if (p) engine.setInput(p.slot, p.input);
        setStatus('running');
        const s = await listSaves(game.id);
        setSaves(s);
        broadcastState(null, s);
      } catch (err) {
        console.error(err);
        if (!alive) return;
        setError((err as Error).message || String(err));
        setStatus('error');
        setNavEnabled(true);
      }
    })();
    const startedAt = Date.now();
    return () => {
      alive = false;
      if (settings.telemetry && Date.now() - startedAt > 30_000) sendTelemetry(game, sys.id, coreFor(sys, settings), Date.now() - startedAt, viewRef.current);
      void engineRef.current?.exit();
      engineRef.current = null;
      session.setSkin('modern', null);
      session.setHostState('library', false, []);
      setNavEnabled(true);
    };
  }, [game.id]);

  // Input hot path → engine (only while the menu is closed).
  useEffect(() => {
    const offInput = session.on('input', (p) => {
      if (!menuRef.current) engineRef.current?.setInput(p.slot, p.input);
    });
    const offLeave = session.on('leave', (p) => {
      engineRef.current?.clearInput(p.slot);
      flash(`P${p.slot + 1} ${p.name} disconnected`);
    });
    const offJoin = session.on('join', (p) => flash(`P${p.slot + 1} ${p.name} joined`));
    const offMenu = session.on('menu', ({ action, arg }) => void doAction(action, arg));
    return () => {
      offInput();
      offLeave();
      offJoin();
      offMenu();
    };
  }, []);

  // Home button / Escape opens the menu; back closes sub-pages.
  useEffect(
    () =>
      onNav((a) => {
        if (a === 'menu') {
          if (menuRef.current) closeMenu();
          else openMenu();
          return true;
        }
        if (a === 'back' && !menuRef.current && status !== 'error') {
          openMenu();
          return true;
        }
        if (a === 'back' && menuRef.current) {
          if (menuRef.current === 'main') closeMenu();
          else setMenu('main');
          return true;
        }
        return false;
      }),
    [status],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'l' || e.key === 'L') setOverlay((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    const t = setInterval(() => engineRef.current && setStats(engineRef.current.stats()), 500);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (menu) document.querySelector<HTMLElement>('.ingame-menu [data-nav-default], .ingame-menu [data-nav]')?.focus();
  }, [menu]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
  }

  function openMenu() {
    engineRef.current?.pause();
    // Release all buttons inside the core so nobody keeps running while paused.
    for (let i = 0; i < 8; i++) engineRef.current?.clearInput(i);
    setMenu('main');
    setNavEnabled(true);
    void listSaves(game.id).then((s) => {
      setSaves(s);
      broadcastState('main', s);
    });
  }

  function closeMenu() {
    setMenu(null);
    setSwapFrom(null);
    setNavEnabled(false);
    engineRef.current?.resume();
    broadcastState(null, saves);
  }

  async function save(slot: number | 'auto') {
    const e = engineRef.current;
    if (!e) return;
    try {
      const wasPaused = e.paused;
      if (wasPaused) e.resume();
      const r = await e.saveState();
      if (wasPaused) e.pause();
      await writeSave(game.id, { slot, at: Date.now(), state: r.state, ...(r.thumbnail ? { thumbnail: r.thumbnail } : {}) });
      if (slot !== 'auto') flash(`Saved to slot ${slot + 1}`);
      await refreshSaves();
    } catch (err) {
      flash(`Save failed: ${(err as Error).message}`);
    }
  }

  async function load(slot: number) {
    const e = engineRef.current;
    const s = await readSave(game.id, slot);
    if (!e || !s) return;
    try {
      e.resume();
      await e.loadState(s.state);
      flash(`Loaded slot ${slot + 1}`);
      closeMenu();
    } catch (err) {
      flash(`Load failed: ${(err as Error).message}`);
    }
  }

  async function quit() {
    await save('auto').catch(() => {});
    onExit();
  }

  async function doAction(action: MenuAction, arg: number) {
    switch (action) {
      case MenuAction.OPEN:
        return openMenu();
      case MenuAction.RESUME:
        return closeMenu();
      case MenuAction.SAVE_STATE:
        return save(arg);
      case MenuAction.LOAD_STATE:
        return load(arg);
      case MenuAction.RESET:
        engineRef.current?.restart();
        return closeMenu();
      case MenuAction.QUIT:
        return quit();
    }
  }

  const slotThumb = (slot: number) => saves.find((s) => s.slot === slot);

  return (
    <div className="player">
      <div className="stage" ref={stageRef} />
      {status === 'loading' && (
        <div className="loading">
          <div className="spinner" />
          <div>
            Starting {game.title} · {sys.name}
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="loading error" data-nav-scope>
          <h2>Couldn’t start this game</h2>
          <p>{error}</p>
          <p className="hint">Check the core download (pnpm cores) and the file in roms/{game.system}/.</p>
          <button className="primary" data-nav data-nav-default onClick={onExit} autoFocus>
            Back to library
          </button>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {overlay && (
        <div className="latency-overlay">
          <div>
            {sys.shortName} · {coreFor(sys, settings)} · {stats.fps.toFixed(1)} fps
          </div>
          {view.players.map((p) => (
            <div key={p.slot} className="lat-row" style={{ color: p.color }}>
              P{p.slot + 1} {p.name}: {TransportLabel[p.transport]} · rtt {fmt(p.rttMs)} · 1-way p50 {fmt(p.oneWayP50)} / p95 {fmt(p.oneWayP95)} ms · jitter{' '}
              {fmt(p.jitterMs)} · loss {p.lossPct.toFixed(1)}%
            </div>
          ))}
        </div>
      )}
      {menu && (
        <div className="ingame-menu" data-nav-scope>
          <div className="menu-head">
            <h2>{game.title}</h2>
            <div className="menu-players">
              {view.players.map((p) => (
                <PlayerChip key={p.slot} p={p} />
              ))}
            </div>
          </div>
          {menu === 'main' && (
            <div className="menu-list">
              <button data-nav data-nav-default onClick={closeMenu}>
                ▶ Resume
              </button>
              <button data-nav onClick={() => setMenu('save')}>
                Save state
              </button>
              <button data-nav onClick={() => setMenu('load')} disabled={!saves.some((s) => s.slot !== 'auto')}>
                Load state
              </button>
              <button data-nav onClick={() => setMenu('players')}>
                Controllers
              </button>
              <button data-nav onClick={() => setOverlay((o) => !o)}>
                {overlay ? 'Hide' : 'Show'} latency overlay
              </button>
              <button
                data-nav
                onClick={() => {
                  engineRef.current?.restart();
                  closeMenu();
                }}
              >
                Reset game
              </button>
              <button data-nav className="danger" onClick={() => void quit()}>
                Quit to library
              </button>
            </div>
          )}
          {(menu === 'save' || menu === 'load') && (
            <div className="slots-grid">
              {[0, 1, 2, 3].map((i) => {
                const s = slotThumb(i);
                return (
                  <button
                    key={i}
                    data-nav
                    data-nav-default={i === 0 ? '' : undefined}
                    disabled={menu === 'load' && !s}
                    onClick={() => void (menu === 'save' ? save(i) : load(i))}
                  >
                    {s?.thumbnail ? <SaveThumb blob={s.thumbnail} /> : <div className="thumb empty">{s ? 'saved' : 'empty'}</div>}
                    <span>
                      Slot {i + 1}
                      {s ? ` · ${new Date(s.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {menu === 'players' && (
            <div className="menu-list">
              <p className="hint">{swapFrom === null ? 'Pick a player, then the slot to swap with (or remove them).' : `Swap P${swapFrom + 1} with…`}</p>
              {Array.from({ length: settings.maxPlayers }, (_, i) => {
                const p = view.players.find((x) => x.slot === i);
                return (
                  <button
                    key={i}
                    data-nav
                    data-nav-default={i === 0 ? '' : undefined}
                    className={swapFrom === i ? 'selected' : ''}
                    onClick={() => {
                      if (swapFrom === null) setSwapFrom(i);
                      else {
                        for (let k = 0; k < 8; k++) engineRef.current?.clearInput(k);
                        session.swapSlots(swapFrom, i);
                        setSwapFrom(null);
                      }
                    }}
                  >
                    P{i + 1}: {p ? `${p.name}${p.connected ? '' : ' (away)'}` : 'empty'}
                  </button>
                );
              })}
              {swapFrom !== null && view.players.some((p) => p.slot === swapFrom) && (
                <button
                  data-nav
                  className="danger"
                  onClick={() => {
                    const p = view.players.find((x) => x.slot === swapFrom);
                    for (let k = 0; k < 8; k++) engineRef.current?.clearInput(k);
                    session.removePlayer(swapFrom);
                    setSwapFrom(null);
                    flash(`Removed ${p?.name ?? `P${swapFrom + 1}`}`);
                  }}
                >
                  Remove P{swapFrom + 1} from the game
                </button>
              )}
              {swapFrom !== null && (
                <button data-nav onClick={() => setSwapFrom(null)}>
                  Cancel
                </button>
              )}
              {swapFrom === null && view.players.length > 0 && (
                <button
                  data-nav
                  onClick={() => {
                    for (let k = 0; k < 8; k++) engineRef.current?.clearInput(k);
                    const removed = session.tidySlots();
                    flash(removed ? `Removed ${removed} away player(s), everyone moved up` : 'Everyone moved up');
                  }}
                >
                  Remove away players and move everyone up
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Anonymous per-session latency summary (opt-in, M6): no names, ids or game titles. */
function sendTelemetry(_game: Game, system: string, core: string, ms: number, view: SessionView) {
  const body = {
    kind: 'latency-session',
    system,
    core,
    minutes: Math.round(ms / 6000) / 10,
    host: { ua: navigator.userAgent.replace(/\([^)]*\)/g, '').slice(0, 80), cores: navigator.hardwareConcurrency },
    players: view.players.map((p) => ({
      transport: TransportLabel[p.transport],
      rttMs: round(p.rttMs),
      p50: round(p.oneWayP50),
      p95: round(p.oneWayP95),
      jitter: round(p.jitterMs),
      lossPct: round(p.lossPct),
    })),
  };
  void fetch('/api/telemetry', { method: 'POST', body: JSON.stringify(body), keepalive: true }).catch(() => {});
}
const round = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

function SaveThumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return <img className="thumb" src={url} alt="" />;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '–');
