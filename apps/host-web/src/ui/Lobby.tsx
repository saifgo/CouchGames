import { PLAYER_COLORS } from '@couch/protocol';
import type { SessionView } from '../net/host-session.js';
import { QR, quality } from './common.js';

/** Join panel: QR + room code + player slots, under the game details on the home screen. */
export function Lobby({ view, joinUrl, maxPlayers, compact = false }: { view: SessionView; joinUrl: string | null; maxPlayers: number; compact?: boolean }) {
  const slots = Array.from({ length: maxPlayers }, (_, i) => view.players.find((p) => p.slot === i) ?? null);
  const joined = view.players.length;
  return (
    <aside className={`lobby ${compact ? 'compact' : ''}`}>
      <div className="lobby-head">
        <span className="lobby-live" />
        <b>{joined ? `${joined}/${maxPlayers} players ready` : 'Scan to join'}</b>
      </div>
      <div className="lobby-main">
        <div className="lobby-qr">
          {joinUrl ? <QR text={joinUrl} size={compact ? 116 : 164} /> : <div className="qr placeholder">…</div>}
        </div>
        <div className="lobby-code">
          <small>Scan with your phone or open</small>
          <div className="lobby-url">{joinUrl ? joinUrl.replace(/^https?:\/\//, '').replace(/\?r=.*/, '') : 'starting…'}</div>
          <small>room code</small>
          <div className="code">{view.room ?? '····'}</div>
          {view.state !== 'open' && <div className="lobby-state">{view.state === 'reconnecting' ? 'Reconnecting to server…' : 'Starting…'}</div>}
        </div>
      </div>
      <div className="slots">
        {slots.map((p, i) => (
          <div
            key={i}
            className={`slot ${p ? (p.connected ? 'filled' : 'filled away') : 'empty'}`}
            style={{ ['--pc' as string]: p?.color ?? PLAYER_COLORS[i] }}
            title={p ? p.name : `P${i + 1} open`}
          >
            <span className="slot-avatar">{p ? p.name.slice(0, 1).toUpperCase() : i + 1}</span>
            <span className="slot-label">{p ? p.name : `P${i + 1}`}</span>
            {p && <span className={`dot ${quality(p)}`} />}
          </div>
        ))}
      </div>
    </aside>
  );
}
