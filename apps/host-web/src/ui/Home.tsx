import { useEffect, useMemo, useRef, useState } from 'react';
import { getSystem, SYSTEMS } from '@couch/systems';
import { systemAvailability, type HostSettings } from '../host-settings.js';
import { favourites, recents, type Game, type LibraryProgress } from '../library/library.js';
import { LibraryLoading, RefreshButton } from './LibraryLoad.js';
import type { SessionView } from '../net/host-session.js';
import { Art, Icon, Logo, useClock } from './common.js';
import { Lobby } from './Lobby.js';
import { StorageChip } from './Storage.js';
import { TvAppButton, TvAppPanel, useApk } from './TvApp.js';

interface Props {
  games: Game[];
  settings: HostSettings;
  view: SessionView;
  joinUrl: string | null;
  onOpen: (g: Game) => void;
  onSettings: () => void;
  onImport: (files: File[]) => void;
  /** Server library load in progress (or just finished), else null. */
  progress: LibraryProgress | null;
  libraryAt: number | null;
  onRefresh: () => void;
  /** Games from the last import: the wheel jumps to the first one and highlights them all. */
  justAdded?: { ids: string[]; at: number } | null;
}

/** Console logos (packages/systems/logos, made by scripts/build-logos.mjs), by system id. */
const LOGOS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../../../../packages/systems/logos/*.svg', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -4),
    url,
  ]),
);

/** A stop on the platform wheel: every game, recents, favourites, then one per system. */
interface Platform {
  key: string;
  label: string;
  /** Full name (logo alt text). */
  title: string;
  sub: string;
  accent?: string;
  /** Console logo shown instead of the label. */
  logo?: string;
  games: Game[];
}

/**
 * Big Box-style home (LaunchBox): a big preview with a details panel on top, then a platform
 * wheel and a cover wheel along the bottom. The cover wheel comes first in the DOM so its first
 * card is the first focus target; CSS grid areas put everything in place.
 */
const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title);

export function Home({ games, settings, view, joinUrl, onOpen, onSettings, onImport, progress, libraryAt, onRefresh, justAdded }: Props) {
  const clock = useClock();
  const [focused, setFocused] = useState<Game | null>(null);
  const [platformKey, setPlatformKey] = useState('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const playable = useMemo(() => games.filter((g) => systemAvailability(getSystem(g.system)!, settings).ok), [games, settings]);
  const hidden = games.length - playable.length;
  const apk = useApk();
  const [showApp, setShowApp] = useState(false);
  const recentAt = useMemo(() => new Map(recents().map((r) => [r.id, r.at])), [games]);
  const favs = useMemo(() => favourites(), [games]);

  const platforms: Platform[] = useMemo(() => {
    const byId = new Map(playable.map((g) => [g.id, g]));
    const out: Platform[] = [{ key: 'all', label: 'All Games', title: 'All Games', sub: `${playable.length} games`, games: [...playable].sort(byTitle) }];
    const recent = recents()
      .map((r) => byId.get(r.id))
      .filter((g): g is Game => !!g);
    if (recent.length) out.push({ key: 'recent', label: 'Recent', title: 'Recently Played', sub: 'Jump back in', accent: '#4dd8ff', games: recent.slice(0, 20) });
    const fav = playable.filter((g) => favs.has(g.id)).sort(byTitle);
    if (fav.length) out.push({ key: 'fav', label: 'Favourites', title: 'Favourites', sub: `${fav.length} games`, accent: '#ffd166', games: fav });
    for (const sys of SYSTEMS) {
      const list = playable.filter((g) => g.system === sys.id).sort(byTitle);
      if (list.length) {
        const logo = LOGOS[sys.id];
        out.push({ key: sys.id, label: sys.shortName, title: sys.name, sub: `${sys.maker} · ${sys.year}`, accent: sys.accent, games: list, ...(logo ? { logo } : {}) });
      }
    }
    return out;
  }, [playable, favs]);
  const platform = platforms.find((p) => p.key === platformKey) ?? platforms[0]!;

  const game = (focused && platform.games.includes(focused) ? focused : platform.games[0]) ?? null;
  const sys = game ? getSystem(game.system) : undefined;

  useEffect(() => {
    // Focus the first cover when the library appears.
    if (!document.activeElement || document.activeElement === document.body) {
      document.querySelector<HTMLElement>('.home [data-nav]')?.focus();
    }
  }, [platforms.length]);

  // After an import: open the added game's console, focus its cover and say what was added.
  const [added, setAdded] = useState<{ ids: Set<string>; text: string } | null>(null);
  const revealId = useRef<string | null>(null);
  useEffect(() => {
    if (!justAdded) return;
    const ids = new Set(justAdded.ids);
    const all = games.filter((g) => ids.has(g.id));
    const shown = playable.filter((g) => ids.has(g.id)).sort(byTitle);
    const what = all.length === 1 ? `“${all[0]!.title}”` : `${all.length} games`;
    const first = shown[0];
    let text: string;
    if (first) {
      const oneSystem = shown.every((g) => g.system === first.system);
      setPlatformKey(oneSystem ? first.system : 'all');
      setFocused(first);
      revealId.current = first.id;
      text = `Added ${what} to ${oneSystem ? getSystem(first.system)!.name : 'your library'}`;
    } else {
      text = `Added ${what}, but ${all.length === 1 ? 'its system is' : 'their systems are'} hidden on this device (see Settings)`;
    }
    setAdded({ ids, text });
    const t = setTimeout(() => setAdded(null), 4500);
    return () => clearTimeout(t);
  }, [justAdded]);
  // Runs after the wheel has re-rendered on the new console, so the cover exists.
  useEffect(() => {
    const id = revealId.current;
    if (!id) return;
    const card = document.querySelector<HTMLElement>(`.wheel [data-game-id="${CSS.escape(id)}"]`);
    if (!card) return;
    revealId.current = null;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });

  const pickPlatform = (key: string) => {
    if (key === platform.key) return;
    setPlatformKey(key);
    setFocused(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onImport([...e.dataTransfer.files]);
  };

  return (
    <div
      className="home"
      data-nav-scope
      style={{ ['--sys' as string]: sys?.accent ?? platform.accent ?? 'var(--accent)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {added && (
        <div className="toast added-toast" role="status" key={justAdded?.at}>
          <Icon name="plus" /> {added.text}
        </div>
      )}

      <div className="backdrop" aria-hidden>
        {game && (
          <div className="backdrop-art" key={game.id}>
            <Art game={game} online={settings.onlineArt} kind="Named_Snaps" />
          </div>
        )}
      </div>

      <section className="wheel" key={platform.key}>
        {platform.games.map((g, i) => (
          <button
            key={g.id}
            className={`card ${g === game ? 'current' : ''} ${added?.ids.has(g.id) ? 'just-added' : ''}`}
            style={{ ['--glow' as string]: getSystem(g.system)?.accent }}
            data-game-id={g.id}
            data-nav
            data-nav-default={i === 0 ? '' : undefined}
            onFocus={() => setFocused(g)}
            onClick={() => onOpen(g)}
          >
            <span className="card-frame">
              <Art game={g} online={settings.onlineArt} />
              {added?.ids.has(g.id) && <span className="new-badge">New</span>}
            </span>
            <span className="card-title">{g.title}</span>
          </button>
        ))}
        {!platform.games.length && (
          <button className="card add-card" data-nav onClick={() => fileRef.current?.click()}>
            <span className="card-frame">
              <Icon name="plus" />
            </span>
            <span className="card-title">Add games</span>
          </button>
        )}
      </section>

      <nav className="platforms">
        {platforms.map((p) => (
          <button
            key={p.key}
            className={`platform ${p.key === platform.key ? 'active' : ''}`}
            style={p.accent ? { ['--pf' as string]: p.accent } : undefined}
            data-nav
            onFocus={() => pickPlatform(p.key)}
            onClick={() => pickPlatform(p.key)}
          >
            {p.logo ? (
              <img className="platform-img" src={p.logo} alt={p.title} draggable={false} />
            ) : (
              <span className="platform-logo">{p.label}</span>
            )}
            <small>{p.sub}</small>
          </button>
        ))}
      </nav>

      <header className="topbar">
        <Logo />
        <div className="topbar-right">
          <span className="clock">{clock}</span>
          <button className="icon-btn" data-nav onClick={onSettings} aria-label="Settings">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <section className="preview" aria-hidden>
        <div className="preview-screen" key={game?.id ?? 'none'}>
          {game ? (
            <Art game={game} online={settings.onlineArt} kind="Named_Snaps" />
          ) : progress && progress.done < progress.total ? (
            <LibraryLoading progress={progress} />
          ) : (
            <div className="preview-empty">
              <b>No games yet</b>
              <span>Your phones are the controllers. Add a game to get started.</span>
            </div>
          )}
        </div>
      </section>

      <aside className="details">
        {game && sys ? (
          <div className="details-game" key={game.id}>
            <h1 className="details-title">
              {game.title}
              {favs.has(game.id) && (
                <span className="details-fav" title="Favourite">
                  <Icon name="starFilled" />
                </span>
              )}
            </h1>
            <p className="details-system">{sys.name}</p>
            <dl className="facts">
              <dt>Made by</dt>
              <dd>
                {sys.maker}, {sys.year}
              </dd>
              <dt>Players</dt>
              <dd>{sys.maxPlayers > 1 ? `1 to ${sys.maxPlayers}` : '1'}</dd>
              <dt>Source</dt>
              <dd>{game.source === 'homebrew' ? 'Free homebrew' : game.source === 'local' ? 'Stored on this TV' : 'Imported ROM'}</dd>
              <dt>Last played</dt>
              <dd>{recentAt.has(game.id) ? ago(recentAt.get(game.id)!) : 'Never'}</dd>
              <dt>Size</dt>
              <dd>{(game.size / 1024 / 1024).toFixed(1)} MB</dd>
            </dl>
            <p className="press-play">
              Press <kbd>A</kbd> to play
            </p>
          </div>
        ) : (
          <div className="details-game">
            <h1 className="details-title">Welcome</h1>
            <p className="facts-text">
              Put your own ROM files in the <code>roms/&lt;system&gt;/</code> folders next to the server (for example <code>roms/snes/</code>), then refresh. Or
              drop files anywhere on this screen. Want something to try right now? Run <code>pnpm test-roms</code>.
            </p>
          </div>
        )}
      </aside>

      <aside className="players-panel">
        <Lobby view={view} joinUrl={joinUrl} maxPlayers={settings.maxPlayers} />
      </aside>

      <footer className="hints">
        <span>
          <kbd>A</kbd> Select
        </span>
        <span>
          <kbd>B</kbd> Back
        </span>
        <span>
          <kbd className="pad">
            <Icon name="dpad" />
          </kbd>{' '}
          Browse
        </span>
        {hidden > 0 &&
          (apk ? (
            <button className="hint hint-link" data-nav onClick={() => setShowApp(true)}>
              {hidden} game{hidden > 1 ? 's' : ''} hidden: play {hidden > 1 ? 'them' : 'it'} in the Android TV app (get it)
            </button>
          ) : (
            <span className="hint">
              {hidden} game{hidden > 1 ? 's' : ''} hidden: their systems need the Android TV app or a faster device (Settings).
            </span>
          ))}
        <span className="grow" />
        {apk && <TvAppButton apk={apk} onOpen={() => setShowApp(true)} />}
        {apk && showApp && <TvAppPanel apk={apk} onClose={() => setShowApp(false)} />}
        <StorageChip />
        <button className="add" data-nav onClick={() => fileRef.current?.click()}>
          <Icon name="plus" /> Add games
        </button>
        <RefreshButton progress={progress} libraryAt={libraryAt} onRefresh={onRefresh} />
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onImport([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </footer>
    </div>
  );
}

function ago(at: number): string {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}
