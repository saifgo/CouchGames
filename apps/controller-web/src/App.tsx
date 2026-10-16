import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button, MenuAction, normalizeRoomCode, TransportKind, TransportLabel, type SkinId } from '@couch/protocol';
import { getSkin, SKINS } from '@couch/skins';
import { enterPlayMode, isStandalone, measureSafeArea } from './device.js';
import { Gyro, requestMotionPermission } from './gyro.js';
import { Haptics, isIOS } from './haptics.js';
import { PadSurface } from './pad/pad.js';
import { InputSender } from './sender.js';
import { Session, type SessionSnapshot } from './session.js';
import { loadSettings, saveSettings, type Settings } from './settings.js';

const params = new URLSearchParams(location.search);
const haptics = new Haptics();

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [room, setRoom] = useState(() => normalizeRoomCode(params.get('r') ?? params.get('room') ?? '') ?? '');
  const [session, setSession] = useState<Session | null>(null);

  const update = (p: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...p };
      saveSettings(next);
      return next;
    });

  const join = async (code: string, name: string) => {
    update({ name });
    await enterPlayMode();
    measureSafeArea();
    if (settings.gyro !== 'off') await requestMotionPermission();
    const s = new Session(code, name, haptics, params.get('server') ?? location.origin);
    s.start();
    setRoom(code);
    setSession(s);
    history.replaceState(null, '', `?r=${code}`);
  };

  const leave = () => {
    session?.close();
    setSession(null);
  };

  const preview = params.get('preview');
  if (preview) return <PreviewScreen skin={preview} settings={settings} />;
  if (!session) return <JoinScreen room={room} name={settings.name} onJoin={join} />;
  return <PlayScreen session={session} settings={settings} update={update} onLeave={leave} />;
}

/* --------------------------------------------------------------- preview */

/** ?preview=<skin>: pad without a connection (skin gallery, visual tests, input debug). */
function PreviewScreen({ skin, settings }: { skin: string; settings: Settings }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bits, setBits] = useState('');
  useEffect(() => {
    const sender = new InputSender({
      sendInput: () => {
        const st = sender.state;
        const names = Object.entries(Button)
          .filter(([, b]) => st.buttons & (1 << b))
          .map(([n]) => n);
        setBits(`${names.join(' ')}  L(${st.lx},${st.ly}) R(${st.rx},${st.ry}) T(${st.l2},${st.r2})`);
      },
    });
    const pad = new PadSurface(ref.current!, sender, haptics);
    pad.applySettings(settings);
    pad.setSkin(getSkin(skin));
    (window as unknown as { __pad: unknown }).__pad = { sender };
  }, []);
  return (
    <div class="play">
      <div class="pad" ref={ref} />
      <div class="debug" data-testid="state">{bits || getSkin(skin).name}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ join */

function JoinScreen(props: { room: string; name: string; onJoin: (room: string, name: string) => void }) {
  const [code, setCode] = useState(props.room);
  const [name, setName] = useState(props.name);
  const [busy, setBusy] = useState(false);
  const valid = normalizeRoomCode(code) !== null;
  const submit = (e: Event) => {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (!c || busy) return;
    setBusy(true);
    props.onJoin(c, name.trim().slice(0, 16) || 'Player');
  };
  return (
    <form class="join" onSubmit={submit}>
      <div class="brand">
        <span class="logo">▲●</span> Couch
      </div>
      <label class="field">
        <span>TV code</span>
        <input
          class="code"
          value={code}
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          spellcheck={false}
          placeholder="ABCD"
          onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())}
        />
      </label>
      <label class="field">
        <span>Your name</span>
        <input value={name} maxLength={16} placeholder="Player" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <button class="primary" disabled={!valid || busy} type="submit">
        {busy ? 'Connecting…' : 'Join'}
      </button>
      <p class="hint">Turn your phone sideways. {isIOS && !isStandalone() ? 'Tip: Share → Add to Home Screen for full screen.' : ''}</p>
    </form>
  );
}

/* ------------------------------------------------------------------ play */

function PlayScreen(props: { session: Session; settings: Settings; update: (p: Partial<Settings>) => void; onLeave: () => void }) {
  const { session, settings, update } = props;
  const padRef = useRef<HTMLDivElement>(null);
  const padApi = useRef<{ pad: PadSurface; sender: InputSender } | null>(null);
  const [snap, setSnap] = useState<SessionSnapshot>(session.snap);
  const [sheet, setSheet] = useState<'none' | 'settings'>('none');
  const [sent, setSent] = useState(0);
  const taps = useRef<number[]>([]);

  useEffect(() => session.subscribe(setSnap), [session]);

  // Build the pad once.
  useEffect(() => {
    const sender = new InputSender({
      sendInput: (bytes) => {
        session.noteSent(sender.state.seq, performance.now());
        session.link.sendInput(bytes);
      },
    });
    const pad = new PadSurface(padRef.current!, sender, haptics);
    padApi.current = { pad, sender };
    sender.start();
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        pad.releaseAll();
        sender.releaseAll();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    const t = setInterval(() => setSent(sender.sent), 1000);
    return () => {
      sender.stop();
      clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [session]);

  const skinId: SkinId = settings.skin === 'auto' ? snap.skin : settings.skin;
  useEffect(() => padApi.current?.pad.setSkin(getSkin(skinId)), [skinId]);
  useEffect(() => padApi.current?.pad.applySettings(settings), [settings]);

  // Gyro → stick.
  useEffect(() => {
    if (settings.gyro === 'off' || !padApi.current) return;
    const { pad, sender } = padApi.current;
    const gyro = new Gyro((x, y, raw) => {
      sender.state.hasGyro = true;
      sender.state.gx = raw.gx;
      sender.state.gy = raw.gy;
      sender.state.gz = raw.gz;
      pad.setGyro(x, y);
    });
    gyro.sensitivity = settings.gyroSensitivity;
    gyro.start();
    return () => {
      gyro.stop();
      sender.state.hasGyro = false;
    };
  }, [settings.gyro, settings.gyroSensitivity]);

  // Hidden debug toggle: triple-tap the player badge.
  const badgeTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 600), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      update({ debug: !settings.debug });
    }
  };

  const banner = linkBanner(snap);
  const quality = qualityOf(snap.rttP95);

  return (
    <div class="play">
      <div class="pad" ref={padRef} />
      <div class="hud">
        <button class="badge" style={{ background: snap.color }} onClick={badgeTap}>
          {snap.slot === null ? '…' : `P${snap.slot + 1}`}
        </button>
        <span class={`ping ${quality}`} title="Connection quality" />
        {snap.gameTitle && <span class="title">{snap.gameTitle}</span>}
        <button class="gear" aria-label="Settings" onClick={() => setSheet('settings')}>
          ⚙
        </button>
      </div>
      {banner && <div class="banner">{banner}</div>}
      {snap.error && <div class="banner error">{snap.error}</div>}
      {settings.debug && (
        <div class="debug">
          {TransportLabel[snap.transport]} · RTT p50 {fmt(snap.rttP50)} / p95 {fmt(snap.rttP95)} ms · host {fmt(snap.hostRtt)} ms, jitter{' '}
          {fmt(snap.hostJitter)}, loss {snap.hostLoss.toFixed(1)}% · sent {sent} · {session.link.dropped} dropped
        </div>
      )}
      {snap.screen === 'menu' && sheet === 'none' && <TvMenu snap={snap} session={session} />}
      {sheet === 'settings' && (
        <SettingsSheet
          settings={settings}
          update={update}
          onClose={() => setSheet('none')}
          onLeave={props.onLeave}
          analog={getSkin(skinId).analog}
          name={settings.name}
          onRename={(n) => session.setName(n)}
        />
      )}
      <div class="rotate">↻ Turn your phone sideways</div>
    </div>
  );
}

function linkBanner(s: SessionSnapshot): string | null {
  switch (s.link) {
    case 'connecting':
      return 'Connecting to the TV…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'waiting-host':
      return 'Waiting for the TV…';
    case 'closed':
      return 'Disconnected';
    default:
      return s.transport === TransportKind.WS_RELAY && s.rttP95 > 40 ? 'High latency (relay)' : null;
  }
}

function qualityOf(p95: number): 'good' | 'ok' | 'bad' | 'unknown' {
  if (Number.isNaN(p95)) return 'unknown';
  return p95 <= 25 ? 'good' : p95 <= 50 ? 'ok' : 'bad';
}

const fmt = (n: number) => (Number.isNaN(n) ? '–' : n.toFixed(1));

/* --------------------------------------------------------------- tv menu */

function TvMenu({ snap, session }: { snap: SessionSnapshot; session: Session }) {
  const [mode, setMode] = useState<'main' | 'save' | 'load'>('main');
  const slots = [0, 1, 2, 3];
  return (
    <div class="sheet tvmenu">
      {mode === 'main' && (
        <div class="row">
          <button class="primary" onClick={() => session.menu(MenuAction.RESUME)}>
            ▶ Resume
          </button>
          <button onClick={() => setMode('save')}>Save state</button>
          <button onClick={() => setMode('load')} disabled={snap.saveSlots.length === 0}>
            Load state
          </button>
          <button onClick={() => session.menu(MenuAction.RESET)}>Reset</button>
          <button class="danger" onClick={() => session.menu(MenuAction.QUIT)}>
            Quit game
          </button>
        </div>
      )}
      {mode !== 'main' && (
        <div class="row">
          {slots.map((i) => (
            <button
              key={i}
              disabled={mode === 'load' && !snap.saveSlots.includes(i)}
              onClick={() => {
                session.menu(mode === 'save' ? MenuAction.SAVE_STATE : MenuAction.LOAD_STATE, i);
                setMode('main');
              }}
            >
              Slot {i + 1}
              {snap.saveSlots.includes(i) ? ' ●' : ''}
            </button>
          ))}
          <button onClick={() => setMode('main')}>Back</button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- settings */

function SettingsSheet(props: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  onClose: () => void;
  onLeave: () => void;
  onRename: (name: string) => void;
  analog: boolean;
  name: string;
}) {
  const { settings: s, update } = props;
  const skins = useMemo(() => Object.values(SKINS).map((k) => ({ id: k.id, name: k.name })), []);
  return (
    <div class="sheet settings" onPointerDown={(e) => e.stopPropagation()}>
      <div class="sheet-head">
        <strong>Controller settings</strong>
        <button onClick={props.onClose}>Done</button>
      </div>
      <div class="grid">
        <label>
          Name
          <input
            value={s.name}
            maxLength={16}
            onChange={(e) => {
              const n = (e.target as HTMLInputElement).value;
              update({ name: n });
              props.onRename(n);
            }}
          />
        </label>
        <label>
          Layout
          <select value={s.skin} onChange={(e) => update({ skin: (e.target as HTMLSelectElement).value as Settings['skin'] })}>
            <option value="auto">Match the game (auto)</option>
            {skins.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Size
          <input type="range" min="0.8" max="1.3" step="0.05" value={s.scale} onInput={(e) => update({ scale: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <label>
          Opacity
          <input type="range" min="0.4" max="1" step="0.05" value={s.opacity} onInput={(e) => update({ opacity: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <label class="check">
          <input type="checkbox" checked={s.mirror} onChange={(e) => update({ mirror: (e.target as HTMLInputElement).checked })} /> Left-handed (mirror)
        </label>
        <label class="check">
          <input type="checkbox" checked={s.haptics} onChange={(e) => update({ haptics: (e.target as HTMLInputElement).checked })} /> Vibrate on press
        </label>
        {props.analog && (
          <>
            <label>
              Sticks
              <select value={s.stickMode} onChange={(e) => update({ stickMode: (e.target as HTMLSelectElement).value as Settings['stickMode'] })}>
                <option value="fixed">Fixed</option>
                <option value="floating">Floating (appear where you touch)</option>
              </select>
            </label>
            <label>
              Dead zone {Math.round(s.deadZone * 100)}%
              <input type="range" min="0" max="0.4" step="0.02" value={s.deadZone} onInput={(e) => update({ deadZone: Number((e.target as HTMLInputElement).value) })} />
            </label>
            <label>
              Tilt to steer (gyro)
              <select
                value={s.gyro}
                onChange={async (e) => {
                  const v = (e.target as HTMLSelectElement).value as Settings['gyro'];
                  if (v !== 'off' && !(await requestMotionPermission())) return;
                  update({ gyro: v });
                }}
              >
                <option value="off">Off</option>
                <option value="left">Left stick</option>
                <option value="right">Right stick</option>
              </select>
            </label>
            {s.gyro !== 'off' && (
              <label>
                Tilt sensitivity
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={s.gyroSensitivity}
                  onInput={(e) => update({ gyroSensitivity: Number((e.target as HTMLInputElement).value) })}
                />
              </label>
            )}
          </>
        )}
        <label class="check">
          <input type="checkbox" checked={s.debug} onChange={(e) => update({ debug: (e.target as HTMLInputElement).checked })} /> Show latency debug
        </label>
      </div>
      <div class="sheet-foot">
        <button class="danger" onClick={props.onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}
