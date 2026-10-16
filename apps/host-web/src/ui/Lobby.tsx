import { PLAYER_COLORS } from '@couch/protocol';
import type { SessionView } from '../net/host-session.js';
import { PlayerChip, QR } from './common.js';

/** Big QR + room code + player slots: the pairing panel. */
export function Lobby({ view, joinUrl, maxPlayers, compact = false }: { view: SessionView; joinUrl: string | null; maxPlayers: number; compact?: boolean }) {
  const slots = Array.from({ length: maxPlayers }, (_, i) => view.players.find((p) => p.slot === i) ?? null);
  return (
    <aside className={`lobby ${compact ? 'compact' : ''}`}>
      <div className="lobby-qr">
        {joinUrl ? <QR text={joinUrl} size={compact ? 150 : 230} /> : <div className="qr placeholder">…</div>}
      </div>
      <div className="lobby-code">
        <small>Scan with your phone, or open</small>
        <div className="lobby-url">{joinUrl ? joinUrl.replace(/^https?:\/\//, '').replace(/\?r=.*/, '') : 'starting…'}</div>
        <small>and enter</small>
        <div className="code">{view.room ?? '····'}</div>
        {view.state !== 'open' && <div className="lobby-state">{view.state === 'reconnecting' ? 'Reconnecting to server…' : 'Starting…'}</div>}
      </div>
      <div className="slots">
        {slots.map((p, i) =>
          p ? (
            <PlayerChip key={i} p={p} big={!compact} />
          ) : (
            <div key={i} className="chip empty" style={{ ['--pc' as string]: PLAYER_COLORS[i] }}>
              <span className="avatar">{i + 1}</span>
              <span className="chip-text">
                <b>P{i + 1}</b>
                {!compact && <small>open slot</small>}
              </span>
            </div>
          ),
        )}
      </div>
    </aside>
  );
}
