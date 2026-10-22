import { useEffect, useMemo, useRef, useState } from 'react';
import { getSystem } from '@couch/systems';
import type { ConsoleId } from '@couch/protocol';
import { startAmbient, stopAmbient } from './ambient.js';
import { onNav, PhoneNavigator } from './focus/focus.js';
import { loadHostSettings, saveHostSettings, systemAvailability, type HostSettings } from './host-settings.js';
import { cachedServerLibrary, importLocalFiles, loadLocalGames, loadServerLibrary, type Game, type LibraryProgress } from './library/library.js';
import { HostSession, type SessionView } from './net/host-session.js';
import { Logo, Modal } from './ui/common.js';
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
      <Logo className="huge" />
      <div className="splash-tagline">Scan. Sit. Play.</div>
      <div className="splash-hint">Press any key or click to switch on</div>
    </button>
  );
}

function Console() {
  const [settings, setSettings] = useState<HostSettings>(loadHostSettings);
  const session = useMemo(() => new HostSession(location.origin, settings.hostName), []);
  const navigator = useMemo(() => new PhoneNavigator(), []);
  const [view, setView] = useState<SessionView>(session.view);
  // Server games come from the saved copy until Refresh; local games are the ones dropped on this page.
  const [cached] = useState(cachedServerLibrary);
  const [serverGames, setServerGames] = useState<Game[]>(cached?.roms ?? []);
  const [libraryAt, setLibraryAt] = useState<number | null>(cached?.at ?? null);
  const [localGames, setLocalGames] = useState<Game[]>([]);
  const [progress, setProgress] = useState<LibraryProgress | null>(null);
  const games = useMemo(() => [...serverGames, ...localGames], [serverGames, localGames]);
  const loadingRef = useRef(false);
  const refreshServer = async (fresh: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const games = await loadServerLibrary({ fresh, onProgress: setProgress, onGames: setServerGames });
    setServerGames(games);
    setLibraryAt(Date.now());
    loadingRef.current = false;
    // Leave the finished bar up for a moment so it reads as "done", not "vanished".
    setTimeout(() => setProgress((p) => (p && p.done === p.total ? null : p)), 1200);
  };
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [detail, setDetail] = useState<Game | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [joinBase, setJoinBase] = useState<string | null>(null);
  /** Games from the last import: Home jumps to them and highlights them. */
  const [justAdded, setJustAdded] = useState<{ ids: string[]; at: number } | null>(null);
  const [picker, setPicker] = useState<{ file: File; options: ConsoleId[]; resolve: (v: ConsoleId | null) => void } | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    (window as unknown as { __couch: unknown }).__couch = { session, version: 1 };
    session.maxPlayers = settings.maxPlayers;
    session.start();
    const off = session.on('change', setView);
    const offIn = session.on('input', (p) => navigator.feed(p.slot, p.input));
    void loadLocalGames().then(setLocalGames);
    if (!cached) void refreshServer(false);
    void resolveJoinBase().then(setJoinBase);
    return () => {
      off();
      offIn();
    };
  }, []);

  useEffect(() => {
    session.maxPlayers = settings.maxPlayers;
    saveHostSettings(settings);
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  useEffect(() => {
    if (settings.ambientMusic && route.name === 'home') startAmbient();
    else stopAmbient();
  }, [settings.ambientMusic, route.name]);

  // Home button on the library screen jumps back to the covers.
  useEffect(
    () =>
      onNav((a) => {
        if (a === 'menu' && routeRef.current.name === 'home') {
          document.querySelector<HTMLElement>('.home .card')?.focus();
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
    if (!added.length) return;
    setLocalGames(await loadLocalGames());
    setJustAdded({ ids: added.map((g) => g.id), at: Date.now() });
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
          void loadLocalGames().then(setLocalGames);
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
        justAdded={justAdded}
        progress={progress}
        libraryAt={libraryAt}
        onRefresh={() => void refreshServer(true)}
      />
      {!settings.onboardingDone && !detail && !showSettings && (
        <Onboarding joinUrl={joinUrl} onDone={() => setSettings((s) => ({ ...s, onboardingDone: true }))} />
      )}
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

/** First-run tips (M6 onboarding). */
function Onboarding({ joinUrl, onDone }: { joinUrl: string | null; onDone: () => void }) {
  const steps = [
    ['Add your games', 'Put your own ROM files in roms/<system>/ next to the server (e.g. roms/snes/), or drop files on this screen. Run pnpm test-roms for free homebrew.'],
    ['Phones are the controllers', `Scan the QR code with each phone — no app to install. Up to 4 players (8 in Settings).${joinUrl ? ` Or open ${joinUrl.replace(/\?r=.*/, '')}` : ''}`],
    ['Home opens the menu', 'In a game, press Home on your phone for save states, controller swaps and quit. Triple-tap your player badge on the phone for latency stats.'],
  ];
  return (
    <Modal onClose={onDone} className="onboarding">
      <h1>Welcome to CouchPad</h1>
      <div className="onboarding-steps">
        {steps.map(([title, text], i) => (
          <div key={title} className="onboarding-step">
            <span className="onboarding-num">{i + 1}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <button className="primary big" data-nav data-nav-default onClick={onDone}>
        Let’s play
      </button>
    </Modal>
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
