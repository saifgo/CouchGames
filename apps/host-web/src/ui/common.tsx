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
  atari2600: 'Atari - 2600',
  pce: 'NEC - PC Engine - TurboGrafx 16',
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

/** Default Couch covers, one per console (packages/systems/covers, made by `pnpm covers`), by system id. */
const COVERS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../../../../packages/systems/covers/*.svg', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -4),
    url,
  ]),
);

/**
 * Box art: online thumbnail when allowed and found, else the console's default Couch cover.
 * Screenshot slots (4:3) show the cover whole, centred on the cover's own background.
 */
export function Art({
  game,
  online,
  kind = 'Named_Boxarts',
  className,
  fallback = true,
}: {
  game: Game;
  online: boolean;
  kind?: 'Named_Boxarts' | 'Named_Snaps' | 'Named_Titles';
  className?: string;
  /** false: render nothing instead of the default cover (where the cover is already shown). */
  fallback?: boolean;
}) {
  const url = online ? thumbnailUrl(game, kind) : null;
  const [ok, setOk] = useState(!!url && !failed.has(url));
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
  if (!fallback) return null;
  const cover = COVERS[game.system];
  const fit = kind === 'Named_Boxarts' ? '' : 'contain';
  if (cover) return <img className={`art default-cover ${fit} ${className ?? ''}`} src={cover} alt="" decoding="async" draggable={false} />;
  return (
    <div className={`art default-cover ${className ?? ''}`}>
      <span className="art-system">{getSystem(game.system)?.shortName}</span>
    </div>
  );
}

/** QR code. Without a size it fills its container (CSS sets the width). */
export function QR({ text, size }: { text: string; size?: number }) {
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
  return <div className="qr" style={size ? { width: size, height: size } : undefined} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function quality(p: PlayerView): 'good' | 'ok' | 'bad' | 'off' {
  if (!p.connected) return 'off';
  const v = Number.isNaN(p.oneWayP95) ? p.rttMs / 2 : p.oneWayP95;
  if (Number.isNaN(v)) return 'good';
  return v <= 20 ? 'good' : v <= 40 ? 'ok' : 'bad';
}

/** Icon of the player's device instead of a letter: iPhone or Android phone. */
export function DeviceIcon({ ios }: { ios: boolean }) {
  return ios ? (
    <svg className="device-icon" viewBox="0 0 24 24" role="img" aria-label="iPhone">
      <rect x="6" y="2" width="12" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="4.2" width="4" height="1.6" rx="0.8" fill="currentColor" />
    </svg>
  ) : (
    <svg className="device-icon" viewBox="0 0 24 24" role="img" aria-label="Android phone">
      <rect x="6" y="2" width="12" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="5" r="1" fill="currentColor" />
      <rect x="10" y="18.3" width="4" height="1.4" rx="0.7" fill="currentColor" />
    </svg>
  );
}

export function PlayerChip({ p, big = false }: { p: PlayerView; big?: boolean }) {
  const q = quality(p);
  const relay = p.transport === TransportKind.WS_RELAY;
  return (
    <div className={`chip ${big ? 'big' : ''} ${p.connected ? '' : 'away'}`} style={{ ['--pc' as string]: p.color }}>
      <span className="avatar">
        <DeviceIcon ios={p.ios} />
      </span>
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

const ICONS = {
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 21v-5h-5" />
    </>
  ),
  tv: (
    <>
      <rect x="2.5" y="5" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </>
  ),
  dpad: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  starFilled: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" />,
} as const;

export type IconName = keyof typeof ICONS;

/** Line icons on a 24px grid, 2px stroke, sized by the font (1em). */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

/** The Couch mark: a triangle and a circle, the A and B of a pad. */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={`logo ${className ?? ''}`}>
      <svg className="logo-mark" viewBox="0 0 44 20" aria-hidden>
        <path d="M10 2.5 19 18H1z" fill="currentColor" />
        <circle cx="33" cy="10.5" r="7.5" fill="currentColor" />
      </svg>
      Couch
    </div>
  );
}
