import { useEffect, useMemo, useRef, useState } from 'react';
import { getSystem, SYSTEMS } from '@couch/systems';
import { systemAvailability, type HostSettings } from '../host-settings.js';
import { favourites, recents, type Game } from '../library/library.js';
import type { SessionView } from '../net/host-session.js';
import { Art, PlayerChip, useClock } from './common.js';
import { Lobby } from './Lobby.js';

interface Props {
  games: Game[];
  settings: HostSettings;
  view: SessionView;
  joinUrl: string | null;
  onOpen: (g: Game) => void;
  onSettings: () => void;
  onImport: (files: File[]) => void;
}

interface Row {
  key: string;
  title: string;
  accent?: string;
  games: Game[];
}

export function Home({ games, settings, view, joinUrl, onOpen, onSettings, onImport }: Props) {
  const clock = useClock();
  const [focused, setFocused] = useState<Game | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playable = useMemo(() => games.filter((g) => systemAvailability(getSystem(g.system)!, settings).ok), [games, settings]);
  const hidden = games.length - playable.length;

  const rows: Row[] = useMemo(() => {
    const byId = new Map(playable.map((g) => [g.id, g]));
    const out: Row[] = [];
    const recent = recents()
      .map((r) => byId.get(r.id))
      .filter((g): g is Game => !!g);
    if (recent.length) out.push({ key: 'recent', title: 'Continue playing', games: recent.slice(0, 12) });
    const favs = favourites();
    const fav = playable.filter((g) => favs.has(g.id));
    if (fav.length) out.push({ key: 'fav', title: 'Favourites', games: fav });
    for (const sys of SYSTEMS) {
      const list = playable.filter((g) => g.system === sys.id).sort((a, b) => a.title.localeCompare(b.title));
      if (list.length) out.push({ key: sys.id, title: sys.name, accent: sys.accent, games: list });
    }
    return out;
  }, [playable]);

  const hero = focused ?? rows[0]?.games[0] ?? null;

  useEffect(() => {
    // Focus the first card when the library appears.
    if (!document.activeElement || document.activeElement === document.body) {
      document.querySelector<HTMLElement>('.home [data-nav]')?.focus();
    }
  }, [rows.length]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onImport([...e.dataTransfer.files]);
  };

  return (
    <div className="home" data-nav-scope onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {hero && (
        <div className="hero-bg" key={hero.id}>
          <Art game={hero} online={settings.onlineArt} kind="Named_Snaps" className="hero-bg-art" />
        </div>
      )}
      <header className="topbar">
        <div className="logo">
          <span>▲●</span> Couch
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

      <div className="home-body">
        <main className="library">
          {hero && (
            <section className="hero">
              <div className="hero-art">
                <Art game={hero} online={settings.onlineArt} />
              </div>
              <div className="hero-info">
                <div className="hero-system" style={{ color: getSystem(hero.system)?.accent }}>
                  {getSystem(hero.system)?.name}
                </div>
                <h1>{hero.title}</h1>
                <p className="hero-meta">
                  Up to {getSystem(hero.system)?.maxPlayers} players · {hero.source === 'homebrew' ? 'Free homebrew' : 'Your game'}
                </p>
                <button className="primary big" data-nav data-nav-default onClick={() => onOpen(hero)}>
                  ▶ Play
                </button>
              </div>
            </section>
          )}

          {rows.map((row) => (
            <section className="row" key={row.key}>
              <h2>
                {row.accent && <i style={{ background: row.accent }} />}
                {row.title} <small>{row.games.length}</small>
              </h2>
              <div className="cards">
                {row.games.map((g) => (
                  <button key={`${row.key}-${g.id}`} className="card" data-nav onFocus={() => setFocused(g)} onClick={() => onOpen(g)}>
                    <Art game={g} online={settings.onlineArt} />
                    <span className="card-title">{g.title}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {!games.length && (
            <section className="empty">
              <h1>No games yet</h1>
              <p>
                Put your own ROM files in the <code>roms/&lt;system&gt;/</code> folders next to the server (for example <code>roms/snes/</code>), then
                press refresh. Or drop files anywhere on this screen.
              </p>
              <p>
                Want something to try right now? Run <code>pnpm test-roms</code> to download free homebrew games.
              </p>
            </section>
          )}

          <section className="row add-row">
            <button className="add" data-nav onClick={() => fileRef.current?.click()}>
              ＋ Add games from this computer
            </button>
            <button className="add" data-nav onClick={() => location.reload()}>
              ⟳ Refresh library
            </button>
            {hidden > 0 && (
              <span className="hint">
                {hidden} game{hidden > 1 ? 's' : ''} hidden: their systems need the Android TV app or a faster device (Settings).
              </span>
            )}
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
          </section>
        </main>
        <Lobby view={view} joinUrl={joinUrl} maxPlayers={settings.maxPlayers} compact={view.players.length > 0} />
      </div>
    </div>
  );
}
