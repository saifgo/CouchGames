import { useEffect, useState } from 'react';
import { getSystem } from '@couch/systems';
import type { HostSettings } from '../host-settings.js';
import { favourites, listSaves, removeLocal, toggleFavourite, type Game } from '../library/library.js';
import { Art, Icon, Modal } from './common.js';

export function GameDetail({ game, settings, onPlay, onClose }: { game: Game; settings: HostSettings; onPlay: (resume: boolean) => void; onClose: () => void }) {
  const sys = getSystem(game.system)!;
  const [fav, setFav] = useState(favourites().has(game.id));
  const [hasAuto, setHasAuto] = useState(false);
  useEffect(() => {
    void listSaves(game.id).then((s) => setHasAuto(s.some((x) => x.slot === 'auto')));
  }, [game.id]);
  return (
    <Modal onClose={onClose} className="detail">
      <div className="detail-art">
        <Art game={game} online={settings.onlineArt} />
      </div>
      <div className="detail-info">
        <h1>{game.title}</h1>
        <div className="detail-shot">
          <Art game={game} online={settings.onlineArt} kind="Named_Snaps" fallback={false} />
        </div>
        <p className="hero-meta">
          <b className="meta-system" style={{ ['--sys' as string]: sys.accent }}>
            {sys.name}
          </b> · {sys.maker} · {sys.year} · up to {sys.maxPlayers} player{sys.maxPlayers > 1 ? 's' : ''} · {(game.size / 1024 / 1024).toFixed(1)} MB ·{' '}
          {game.source === 'homebrew' ? 'free homebrew' : game.source === 'local' ? 'stored in this browser' : `roms/${game.system}/${game.file}`}
        </p>
        <div className="detail-actions">
          {hasAuto && (
            <button className="primary big" data-nav data-nav-default onClick={() => onPlay(true)}>
              <Icon name="play" /> Continue
            </button>
          )}
          <button className={hasAuto ? 'big' : 'primary big'} data-nav data-nav-default={hasAuto ? undefined : ''} onClick={() => onPlay(false)}>
            {hasAuto ? (
              'Start over'
            ) : (
              <>
                <Icon name="play" /> Play
              </>
            )}
          </button>
          <button data-nav onClick={() => setFav(toggleFavourite(game.id))}>
            <Icon name={fav ? 'starFilled' : 'star'} /> {fav ? 'Favourite' : 'Add to favourites'}
          </button>
          {game.source === 'local' && (
            <button
              data-nav
              className="danger"
              onClick={async () => {
                await removeLocal(game.id);
                location.reload();
              }}
            >
              Remove
            </button>
          )}
          <button data-nav onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    </Modal>
  );
}
