import QRCode from 'qrcode';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getSystem } from '@couch/systems';
import { TransportKind, TransportLabel } from '@couch/protocol';
import { onNav } from '../focus/focus.js';
import type { Game } from '../library/library.js';
import type { PlayerView } from '../net/host-session.js';

/** libretro-thumbnails folder names (https://thumbnails.libretro.com). */
const THUMB_DIRS: Record<string, string> = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  genesis: 'Sega - Mega Drive - Genesis',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance',
  psx: 'Sony - PlayStation',
  n64: 'Nintendo - Nintendo 64',
  psp: 'Sony - PlayStation Portable',
  nds: 'Nintendo - Nintendo DS',
  ps2: 'Sony - PlayStation 2',
};

/** No-Intro style name → thumbnail URL. libretro replaces the characters & * / : ` < > ? \ | with "_". */
export function thumbnailUrl(g: Game, kind: 'Named_Boxarts' | 'Named_Snaps' | 'Named_Titles' = 'Named_Boxarts'): string | null {
  const dir = THUMB_DIRS[g.system];
  if (!dir || g.source === 'homebrew') return null;
  const name = (g.canonical ?? g.file.replace(/\.[^.]+$/, '')).replace(/[&*/:`<>?\\|]/g, '_');
  return `https://thumbnails.libretro.com/${encodeURIComponent(dir)}/${kind}/${encodeURIComponent(name)}.png`;
}

const failed = new Set<string>();

/** Box art: online thumbnail when allowed and found, else generated art in the system's colours. */
export function Art({ game, online, kind = 'Named_Boxarts', className }: { game: Game; online: boolean; kind?: 'Named_Boxarts' | 'Named_Snaps' | 'Named_Titles'; className?: string }) {
  const url = online ? thumbnailUrl(game, kind) : null;
  const [ok, setOk] = useState(!!url && !failed.has(url));
  const sys = getSystem(game.system);
  useEffect(() => setOk(!!url && !failed.has(url)), [url]);
  if (url && ok) {
    return (
      <img
        className={`art ${className ?? ''}`}
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => {
          failed.add(url);
          setOk(false);
        }}
      />
    );
  }
  const hue = hash(game.title) % 360;
  return (
    <div
      className={`art generated ${className ?? ''}`}
      style={{ background: `linear-gradient(150deg, ${sys?.accent ?? '#333'} 0%, hsl(${hue} 45% 22%) 70%, #07090d 100%)` }}
    >
      <span className="art-system">{sys?.shortName}</span>
      <span className="art-title">{game.title}</span>
    </div>
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function QR({ text, size = 220 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    void QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#07090d', light: '#ffffff' } }).then(
      (s) => alive && setSvg(s),
    );
    return () => {
      alive = false;
    };
  }, [text]);
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function quality(p: PlayerView): 'good' | 'ok' | 'bad' | 'off' {
  if (!p.connected) return 'off';
  const v = Number.isNaN(p.oneWayP95) ? p.rttMs / 2 : p.oneWayP95;
  if (Number.isNaN(v)) return 'good';
  return v <= 20 ? 'good' : v <= 40 ? 'ok' : 'bad';
}

export function PlayerChip({ p, big = false }: { p: PlayerView; big?: boolean }) {
  const q = quality(p);
  const relay = p.transport === TransportKind.WS_RELAY;
  return (
    <div className={`chip ${big ? 'big' : ''} ${p.connected ? '' : 'away'}`} style={{ ['--pc' as string]: p.color }}>
      <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
      <span className="chip-text">
        <b>
          P{p.slot + 1} · {p.name}
        </b>
        {big && (
          <small>
            {p.connected
              ? `${TransportLabel[p.transport]} · ${Number.isNaN(p.oneWayP50) ? '…' : `${Math.round(p.oneWayP50)}–${Math.round(p.oneWayP95)} ms lag`}${q !== 'good' ? (relay ? ' · high latency (relay)' : ' · weak Wi-Fi: move closer or use 5 GHz') : ''}`
              : 'reconnecting…'}
          </small>
        )}
      </span>
      <span className={`dot ${q}`} />
    </div>
  );
}

/** Modal with its own navigation scope; "back" closes it. */
export function Modal({ children, onClose, className }: { children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-nav-default]') ?? ref.current?.querySelector<HTMLElement>('[data-nav]');
    first?.focus();
    const off = onNav((a) => {
      if (a === 'back') {
        onClose();
        return true;
      }
      return false;
    });
    return () => {
      off();
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <div className={`modal ${className ?? ''}`} ref={ref} data-nav-scope>
        {children}
      </div>
    </div>
  );
}

export function useClock(): string {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 15_000);
    return () => clearInterval(i);
  }, []);
  return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
