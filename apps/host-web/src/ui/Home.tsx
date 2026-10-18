import { useEffect, useMemo, useRef, useState } from 'react';
import { getSystem, SYSTEMS } from '@couch/systems';
import { systemAvailability, type HostSettings } from '../host-settings.js';
import { favourites, recents, type Game } from '../library/library.js';
import type { SessionView } from '../net/host-session.js';
import { Art, PlayerChip, useClock } from './common.js';
import { Lobby } from './Lobby.js';
import { StorageChip } from './Storage.js';

interface Props {
  games: Game[];
  settings: HostSettings;
  view: SessionView;
  joinUrl: string | null;
  onOpen: (g: Game) => void;
  onSettings: () => void;
  onImport: (files: File[]) => void;
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
  /** Full name for the header. */
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
export function Home({ games, settings, view, joinUrl, onOpen, onSettings, onImport }: Props) {
  const clock = useClock();
  const [focused, setFocused] = useState<Game | null>(null);
  const [platformKey, setPlatformKey] = useState('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const playable = useMemo(() => games.filter((g) => systemAvailability(getSystem(g.system)!, settings).ok), [games, settings]);
  const hidden = games.length - playable.length;
  const recentAt = useMemo(() => new Map(recents().map((r) => [r.id, r.at])), [games]);
  const favs = useMemo(() => favourites(), [games]);

  const platforms: Platform[] = useMemo(() => {
    const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title);
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
      <div className="backdrop" aria-hidden>
        {game && (
          <div className="backdrop-art" key={game.id}>
            <Art game={game} online={settings.onlineArt} kind="Named_Snaps" />
          </div>
        )}
        <div className="backdrop-grid" />
        <div className="backdrop-scan" />
      </div>

      <section className="wheel" key={platform.key}>
        {platform.games.map((g, i) => (
          <button
            key={g.id}
            className={`card ${g === game ? 'current' : ''}`}
            style={{ ['--glow' as string]: getSystem(g.system)?.accent }}
            data-nav
            data-nav-default={i === 0 ? '' : undefined}
            onFocus={() => setFocused(g)}
            onClick={() => onOpen(g)}
          >
            <span className="card-frame">
              <Art game={g} online={settings.onlineArt} />
            </span>
            <span className="card-title">{g.title}</span>
          </button>
        ))}
        {!platform.games.length && (
          <button className="card add-card" data-nav onClick={() => fileRef.current?.click()}>
            <span className="card-frame">＋</span>
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
        <div className="logo">
          <span>▲●</span> Couch
        </div>
        <div className="crumb">
          {platform.title}
          <small>
            {game ? platform.games.indexOf(game) + 1 : 0} / {platform.games.length}
          </small>
        </div>
        <div className="topbar-players">
          {view.players.map((p) => (
            <PlayerChip key={p.slot} p={p} />
          ))}
        </div>
        <div className="topbar-right">
          <span className="clock">{clock}</span>
          <button className="icon-btn" data-nav onClick={onSettings} aria-label="Settings">
            ⚙
          </button>
        </div>
      </header>

      <section className="preview" aria-hidden>
        <div className="preview-screen" key={game?.id ?? 'none'}>
          {game ? (
            <Art game={game} online={settings.onlineArt} kind="Named_Snaps" />
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
            <h1 className="script">{game.title}</h1>
            <dl className="facts">
              <dt>Platform</dt>
              <dd>{sys.name}</dd>
              <dt>Maker</dt>
              <dd>
                {sys.maker}, {sys.year}
              </dd>
              <dt>Play Mode</dt>
              <dd>{sys.maxPlayers > 1 ? `Multiplayer (1–${sys.maxPlayers})` : 'Single Player'}</dd>
              <dt>Status</dt>
              <dd>{game.source === 'homebrew' ? 'Free Homebrew' : game.source === 'local' ? 'Stored on this TV' : 'Imported ROM'}</dd>
              <dt>Last Played</dt>
              <dd>{recentAt.has(game.id) ? ago(recentAt.get(game.id)!) : 'Never'}</dd>
              <dt>Size</dt>
              <dd>{(game.size / 1024 / 1024).toFixed(1)} MB</dd>
              {favs.has(game.id) && (
                <>
                  <dt>Favourite</dt>
                  <dd className="fav">★★★★★</dd>
                </>
              )}
            </dl>
            <p className="press-play">
              Press <kbd>A</kbd> to play
            </p>
          </div>
        ) : (
          <div className="details-game">
            <h1 className="script">Welcome</h1>
            <p className="facts-text">
              Put your own ROM files in the <code>roms/&lt;system&gt;/</code> folders next to the server (for example <code>roms/snes/</code>), then refresh. Or
              drop files anywhere on this screen. Want something to try right now? Run <code>pnpm test-roms</code>.
            </p>
          </div>
        )}
      </aside>

      <aside className="players-panel">
        <h2 className="script">Players</h2>
        <Lobby view={view} joinUrl={joinUrl} maxPlayers={settings.maxPlayers} />
      </aside>

      <footer className="hints">
        <span>
          <kbd className="btn-a">A</kbd> Select
        </span>
        <span>
          <kbd className="btn-b">B</kbd> Back
        </span>
        <span>
          <kbd>✚</kbd> Browse
        </span>
        {hidden > 0 && (
          <span className="hint">
            {hidden} game{hidden > 1 ? 's' : ''} hidden: their systems need the Android TV app or a faster device (Settings).
          </span>
        )}
        <span className="grow" />
        <StorageChip />
        <button className="add" data-nav onClick={() => fileRef.current?.click()}>
          ＋ Add games
        </button>
        <button className="add" data-nav onClick={() => location.reload()}>
          ⟳ Refresh
        </button>
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
