import { useEffect, useMemo, useRef, useState } from 'react';
import { getSystem } from '@couch/systems';
import type { ConsoleId } from '@couch/protocol';
import { startAmbient, stopAmbient } from './ambient.js';
import { onNav, PhoneNavigator } from './focus/focus.js';
import { loadHostSettings, saveHostSettings, systemAvailability, type HostSettings } from './host-settings.js';
import { importLocalFiles, loadLibrary, type Game } from './library/library.js';
import { HostSession, type SessionView } from './net/host-session.js';
import { Modal } from './ui/common.js';
import { GameDetail } from './ui/GameDetail.js';
import { Home } from './ui/Home.js';
import { Player } from './ui/Player.js';
import { SettingsModal } from './ui/Settings.js';

type Route = { name: 'home' } | { name: 'playing'; game: Game; resume: boolean };

export function App() {
  const params = new URLSearchParams(location.search);
  const [on, setOn] = useState(params.get('autostart') === '1');
  if (!on) return <Splash onStart={() => setOn(true)} />;
  return <Console />;
}

/**
 * One interaction is required before audio may play (autoplay policy). After it
 * the page has sticky activation, so games launched later from a phone have sound.
 */
function Splash({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const go = () => onStart();
    window.addEventListener('keydown', go, { once: true });
    return () => window.removeEventListener('keydown', go);
  }, []);
  return (
    <button className="splash" onClick={onStart} autoFocus>
      <div className="logo huge">
        <span>▲●</span> Couch
      </div>
      <div className="splash-hint">Press any key or click to switch on</div>
    </button>
  );
}

function Console() {
  const [settings, setSettings] = useState<HostSettings>(loadHostSettings);
  const session = useMemo(() => new HostSession(location.origin, settings.hostName), []);
  const navigator = useMemo(() => new PhoneNavigator(), []);
  const [view, setView] = useState<SessionView>(session.view);
  const [games, setGames] = useState<Game[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [detail, setDetail] = useState<Game | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [joinBase, setJoinBase] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ file: File; options: ConsoleId[]; resolve: (v: ConsoleId | null) => void } | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    (window as unknown as { __couch: unknown }).__couch = { session, version: 1 };
    session.maxPlayers = settings.maxPlayers;
    session.start();
    const off = session.on('change', setView);
    const offIn = session.on('input', (p) => navigator.feed(p.slot, p.input));
    void loadLibrary().then(setGames);
    void resolveJoinBase().then(setJoinBase);
    return () => {
      off();
      offIn();
    };
  }, []);

  useEffect(() => {
    session.maxPlayers = settings.maxPlayers;
    saveHostSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (settings.ambientMusic && route.name === 'home') startAmbient();
    else stopAmbient();
  }, [settings.ambientMusic, route.name]);

  // Home button on the library screen opens the lobby/settings? Keep it simple: focus the hero.
  useEffect(
    () =>
      onNav((a) => {
        if (a === 'menu' && routeRef.current.name === 'home') {
          document.querySelector<HTMLElement>('.hero [data-nav]')?.focus();
          return true;
        }
        return false;
      }),
    [],
  );

  const joinUrl = joinBase && view.room ? `${joinBase}/c/?r=${view.room}` : null;

  const play = (g: Game, resume: boolean) => {
    const sys = getSystem(g.system)!;
    const avail = systemAvailability(sys, settings);
    if (!avail.ok) {
      alert(avail.reason);
      return;
    }
    setDetail(null);
    setRoute({ name: 'playing', game: g, resume });
  };

  const onImport = async (files: File[]) => {
    const added = await importLocalFiles(files, (file, options) => new Promise((resolve) => setPicker({ file, options, resolve })));
    if (added.length) setGames(await loadLibrary());
  };

  if (route.name === 'playing') {
    return (
      <Player
        key={route.game.id}
        game={route.game}
        resume={route.resume}
        settings={settings}
        session={session}
        view={view}
        setNavEnabled={(e) => (navigator.enabled = e)}
        onExit={() => {
          setRoute({ name: 'home' });
          void loadLibrary().then(setGames);
        }}
      />
    );
  }

  return (
    <>
      <Home
        games={games}
        settings={settings}
        view={view}
        joinUrl={joinUrl}
        onOpen={setDetail}
        onSettings={() => setShowSettings(true)}
        onImport={(f) => void onImport(f)}
      />
      {detail && <GameDetail game={detail} settings={settings} onPlay={(resume) => play(detail, resume)} onClose={() => setDetail(null)} />}
      {showSettings && <SettingsModal settings={settings} onChange={(p) => setSettings((s) => ({ ...s, ...p }))} onClose={() => setShowSettings(false)} />}
      {picker && (
        <Modal
          onClose={() => {
            picker.resolve(null);
            setPicker(null);
          }}
        >
          <h2>Which system is “{picker.file.name}” for?</h2>
          <div className="menu-list">
            {picker.options.map((id, i) => (
              <button
                key={id}
                data-nav
                data-nav-default={i === 0 ? '' : undefined}
                onClick={() => {
                  picker.resolve(id);
                  setPicker(null);
                }}
              >
                {getSystem(id)?.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Base URL phones should open. If the TV page runs on localhost, phones can't
 * reach "localhost", so ask the server for its LAN address.
 */
async function resolveJoinBase(): Promise<string> {
  const host = location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return location.origin;
  try {
    const r = (await (await fetch('/api/lan')).json()) as { port: number; secure: boolean; addresses: { address: string; virtual: boolean }[] };
    const a = r.addresses.find((x) => !x.virtual) ?? r.addresses[0];
    if (a) return `${r.secure ? 'https' : 'http'}://${a.address}:${location.port === '5173' ? r.port : location.port || r.port}`;
  } catch {
    /* fall through */
  }
  return location.origin;
}
