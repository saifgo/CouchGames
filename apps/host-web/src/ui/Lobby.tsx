import { PLAYER_COLORS } from '@couch/protocol';
import type { SessionView } from '../net/host-session.js';
import { DeviceIcon, QR, quality } from './common.js';

/**
 * Join panel on the home screen: a QR code big enough to scan from the sofa, the room code and
 * address for typing it in, then the player slots. No labels: the code and the address explain themselves.
 */
export function Lobby({ view, joinUrl, maxPlayers, compact = false }: { view: SessionView; joinUrl: string | null; maxPlayers: number; compact?: boolean }) {
  const slots = Array.from({ length: maxPlayers }, (_, i) => view.players.find((p) => p.slot === i) ?? null);
  const joined = view.players.length;
  const address = joinUrl ? joinUrl.replace(/^https?:\/\//, '').replace(/\?r=.*/, '') : null;
  return (
    <section className={`lobby ${compact ? 'compact' : ''}`} aria-label="Join with your phone">
      <h2 className="lobby-head">{joined ? `${joined} of ${maxPlayers} players in` : 'Scan to join'}</h2>
      <div className="lobby-qr">{joinUrl ? <QR text={joinUrl} /> : <div className="qr placeholder">Starting…</div>}</div>
      <div className="lobby-code">
        <span className="code">{view.room ?? '····'}</span>
      </div>
      <div className="lobby-url">{address ?? ' '}</div>
      {view.state !== 'open' && <div className="lobby-state">{view.state === 'reconnecting' ? 'Reconnecting to the server…' : 'Starting…'}</div>}
      <div className={`slots ${maxPlayers > 4 ? 'many' : ''}`}>
        {slots.map((p, i) => (
          <div
            key={i}
            className={`slot ${p ? (p.connected ? 'filled' : 'filled away') : 'empty'}`}
            style={{ ['--pc' as string]: p?.color ?? PLAYER_COLORS[i] }}
            title={p ? p.name : `P${i + 1} open`}
          >
            <span className="slot-avatar">{p ? <DeviceIcon ios={p.ios} /> : i + 1}</span>
            <span className="slot-label">{p ? p.name : `P${i + 1}`}</span>
            {p && <span className={`dot ${quality(p)}`} />}
          </div>
        ))}
      </div>
    </section>
  );
}
