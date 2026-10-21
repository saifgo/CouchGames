/**
 * Arcade Pixel Art theme: small pixel drawings of each console's controller or handheld, used on
 * the platform row instead of the logo images. Original art (no logos). Each row is one line of
 * pixels; '.' is transparent and every other letter maps to a colour in `c`.
 */
interface Sprite {
  rows: string[];
  c: Record<string, string>;
}

const SPRITES: Record<string, Sprite> = {
  nes: {
    rows: ['gggggggggggggggg', 'gkkkkkkkkkkkkkkg', 'gkdkkkkkkkkkkkkg', 'gdddkkwwkkrkrkkg', 'gkdkkkkkkkkkkkkg', 'gkkkkkkkkkkkkkkg', 'gggggggggggggggg'],
    c: { g: '#bcbcbc', k: '#1c1c1c', d: '#000', w: '#7c7c7c', r: '#f83800' },
  },
  snes: {
    rows: ['..gggg......gggg..', '.gggggggggggggggg.', 'ggdgggggggggggyggg', 'gdddggppgpggbgrggg', 'ggdgggggggggggaggg', '.gggggggggggggggg.', '..gggg......gggg..'],
    c: { g: '#c8c6d6', d: '#3a3850', p: '#7b5fc7', y: '#f0c020', b: '#3050e0', r: '#e03030', a: '#30a050' },
  },
  genesis: {
    rows: ['..kkkkkkkkkkkk..', '.kkkkkkkkkkkkkk.', 'kkdkkkkkkkkkkkkk', 'kdddkkkkkkrrrkkk', 'kkdkkkkkkkkkkkkk', '.kkkkkkkkkkkkkk.', '..kkkk....kkkk..'],
    c: { k: '#2a2c36', d: '#000', r: '#ff2a2a' },
  },
  gb: {
    rows: ['gggggggggg', 'gssssssssg', 'gsllllllsg', 'gsllllllsg', 'gsllllllsg', 'gssssssssg', 'gggggggggg', 'gdgggggmmg', 'dddggggggg', 'gdgggggggg', 'gggggggggg'],
    c: { g: '#c4c4c4', s: '#5d5b74', l: '#8bac0f', d: '#2a2a2a', m: '#a3195b' },
  },
  gbc: {
    rows: ['pppppppppp', 'pssssssssp', 'psllllllsp', 'psllllllsp', 'psllllllsp', 'pssssssssp', 'pppppppppp', 'pdpppppyyp', 'dddppppppp', 'pdpppppppp', 'pppppppppp'],
    c: { p: '#8a50d8', s: '#1a1030', l: '#00c8b4', d: '#1a1030', y: '#ffd400' },
  },
  gba: {
    rows: ['..iiiiiiiiiiiiii..', '.iiiisssssssssiii.', 'iidiisllllllllsiyi', 'idddisllllllllsyii', 'iidiisllllllllsiii', '.iiiisssssssssiii.', '..iiiiiiiiiiiiii..'],
    c: { i: '#4b3fb5', s: '#15123a', l: '#78a0f8', d: '#1d1748', y: '#c9c6f0' },
  },
  psx: {
    rows: ['..gggg......gggg..', '.gggggggggggggggg.', 'ggdgggggggggggtggg', 'gdddggkgkgggsgcggg', 'ggdgggggggggggxggg', '.gggggggggggggggg.', '..ggg........ggg..'],
    c: { g: '#c8ccd4', d: '#4a5060', k: '#2a3040', t: '#2fb36a', c: '#e03a3a', x: '#3a6fe0', s: '#e070b0' },
  },
  n64: {
    rows: ['.ggggggggggggggg.', 'gggrgggggggggyyg', 'ggrrrggkkggggyyg', 'gggrggkkkkgggbbg', '.ggggggkkgggggg.', '..gg...gg...gg..', '..gg...gg...gg..'],
    c: { g: '#8a8e98', r: '#e2231a', k: '#2e3036', y: '#ffcc00', b: '#1a4ea8' },
  },
  psp: {
    rows: ['.kkkkkkkkkkkkkkkkkk.', 'kkdkksssssssssskkxkk', 'kdddksllllllllskckxk', 'kkdkksllllllllskkxkk', 'kkkkksssssssssskkkkk', '.kkkkkkkkkkkkkkkkkk.'],
    c: { k: '#1c1e24', s: '#000', l: '#2050a0', d: '#5a6070', x: '#7fd4ff', c: '#7fd4ff' },
  },
  nds: {
    rows: ['wwwwwwwwwwww', 'wssssssssssw', 'wsllllllllsw', 'wssssssssssw', 'gggggggggggg', 'wwwwwwwwwwww', 'wdwssssssbww', 'dddsllllsbbw', 'wdwsllllswww', 'wwwsssssswww', 'wwwwwwwwwwww'],
    c: { w: '#e4e8ee', s: '#2a3240', l: '#88c8f8', g: '#a7b3c4', d: '#2a3240', b: '#2a8ad8' },
  },
  ps2: {
    rows: ['..kkkk......kkkk..', '.kkkkkkkkkkkkkkkk.', 'kkdkkkkkkkkkkktkkk', 'kdddkkbkbkkkskckkk', 'kkdkkkkkkkkkkkxkkk', '.kkkkkkkkkkkkkkkk.', '..kkk........kkk..'],
    c: { k: '#1a1c24', d: '#4a5060', b: '#3a6ad8', t: '#2fb36a', c: '#e03a3a', x: '#3a6fe0', s: '#e070b0' },
  },
  atari2600: {
    rows: ['......kk......', '......kk......', '......kk......', '..r...kk......', 'kkkkkkkkkkkkkk', 'kwwwwwwwwwwwwk', 'kkkkkkkkkkkkkk'],
    c: { k: '#141210', r: '#d8401a', w: '#ff8a1e' },
  },
  pce: {
    rows: ['wwwwwwwwwwwwww', 'wkkkkkkkkkkkkw', 'wkddkkkkkoookw', 'wkkkkkkkkkkkkw', 'wwwwwwwwwwwwww', 'oooooooooooooo'],
    c: { w: '#fafafa', k: '#2a2a2a', d: '#bdb8ad', o: '#e0561f' },
  },
};

export const hasPixelIcon = (system: string): boolean => system in SPRITES;

/** Pixel console icon, or null when there is no drawing for this system. Scales to its CSS height. */
export function PixelIcon({ system, className, title }: { system: string; className?: string; title?: string }) {
  const s = SPRITES[system];
  if (!s) return null;
  const w = Math.max(...s.rows.map((r) => r.length));
  const h = s.rows.length;
  const rects: React.ReactElement[] = [];
  s.rows.forEach((row, y) => {
    // Merge runs of the same colour into one rect per run.
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = s.c[ch];
      if (ch !== '.' && fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={fill} />);
      x = end;
    }
  });
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" role="img" aria-label={title}>
      {rects}
    </svg>
  );
}
