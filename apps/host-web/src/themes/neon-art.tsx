/**
 * Neon Arcade theme: the console marquee sign in the top bar and the neon-tube drawings of each
 * console's signature shapes beside the preview screen. Mockups: docs/design/themes/neon.html.
 *
 * The drawings are original line art (buttons, cartridges, discs, handheld outlines), not logos.
 * The marquee shows the console logo from packages/systems/logos (see docs/LICENSES.md).
 * Both are absolutely positioned, so they never move the layout.
 */

/** One neon tube group: stroke colour plus SVG shapes (viewBox 0 0 200 240). */
const G = (c: string, inner: string, w = 5) =>
  `<g fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" filter="url(#neon-glow)">${inner}</g>`;
/** Tube lettering: white core, coloured glow. */
const T = (c: string, x: number, y: number, size: number, text: string, extra = '') =>
  `<text x="${x}" y="${y}" fill="#fff" stroke="${c}" stroke-width="1.5" font-size="${size}" font-family="'Tilt Neon', sans-serif" text-anchor="middle" filter="url(#neon-glow-soft)" ${extra}>${text}</text>`;

const PS_SHAPES =
  G('#2fe08a', '<path d="M55 40 L85 92 L25 92 Z"/>') +
  G('#ff3a5c', '<circle cx="150" cy="70" r="28"/>') +
  G('#6ea8ff', '<path d="M28 140 L82 194 M82 140 L28 194"/>') +
  G('#ff7ad9', '<rect x="122" y="140" width="56" height="56" rx="3"/>');

/** [left of the screen, right of the screen] per console. */
const MOTIFS: Record<string, [string, string]> = {
  nes: [
    G('#bcbcbc', '<path d="M40 95 h30 v-30 h26 v30 h30 v26 h-30 v30 h-26 v-30 h-30 Z"/>') + G('#ff2b3a', '<circle cx="70" cy="205" r="20"/><circle cx="135" cy="205" r="20"/>'),
    G('#bcbcbc', '<rect x="35" y="40" width="130" height="160" rx="6"/><rect x="55" y="62" width="90" height="80"/>') + G('#ff2b3a', '<path d="M55 165 h90 M55 180 h90"/>', 4),
  ],
  snes: [
    G('#6ea8ff', '<circle cx="100" cy="55" r="26"/>') + G('#ff3b3b', '<circle cx="160" cy="115" r="26"/>') + G('#ffd23f', '<circle cx="100" cy="175" r="26"/>') + G('#2fe08a', '<circle cx="40" cy="115" r="26"/>') +
      T('#6ea8ff', 100, 66, 30, 'X') + T('#ff3b3b', 160, 126, 30, 'A') + T('#ffd23f', 100, 186, 30, 'B') + T('#2fe08a', 40, 126, 30, 'Y'),
    G('#b9b4d0', '<path d="M30 200 V70 Q30 40 60 40 H140 Q170 40 170 70 V200 Z"/><rect x="52" y="70" width="96" height="80"/>') + G('#a46bff', '<path d="M60 180 h80"/>', 4),
  ],
  genesis: [
    T('#ff2a2a', 100, 110, 64, '16', 'font-style="italic"') + T('#2f8bff', 100, 170, 46, '-BIT', 'font-style="italic"') + G('#ff2a2a', '<path d="M20 200 h160 M35 215 h130"/>', 4),
    G('#dfe6f2', '<circle cx="45" cy="150" r="22"/><circle cx="100" cy="130" r="22"/><circle cx="155" cy="110" r="22"/>') + T('#dfe6f2', 45, 160, 26, 'A') + T('#dfe6f2', 100, 140, 26, 'B') + T('#dfe6f2', 155, 120, 26, 'C') +
      G('#ff2a2a', '<path d="M30 60 h140"/>', 4),
  ],
  gb: [
    G('#c4c4c4', '<path d="M40 20 H160 V200 Q160 225 135 225 H40 Z"/>') + G('#8cff2e', '<rect x="58" y="40" width="84" height="70"/>') + G('#ff3aa8', '<circle cx="128" cy="160" r="11"/><circle cx="104" cy="172" r="11"/>') +
      G('#c4c4c4', '<path d="M60 165 h26 M73 152 v26"/>'),
    T('#ff3aa8', 100, 60, 32, 'DOT MATRIX') + T('#8cff2e', 100, 100, 26, 'WITH STEREO') + T('#8cff2e', 100, 132, 26, 'SOUND') + G('#ff2b3a', '<circle cx="100" cy="172" r="9"/>') + T('#ff2b3a', 100, 214, 24, 'BATTERY'),
  ],
  gbc: [
    G('#b46bff', '<path d="M40 20 H160 V200 Q160 225 135 225 H65 Q40 225 40 200 Z"/>') + G('#00ffd5', '<rect x="58" y="40" width="84" height="70"/>') + G('#ffd400', '<circle cx="128" cy="160" r="11"/><circle cx="104" cy="172" r="11"/>'),
    T('#ff3b3b', 40, 130, 46, 'C') + T('#b46bff', 70, 130, 46, 'O') + T('#2fe08a', 100, 130, 46, 'L') + T('#ffd400', 130, 130, 46, 'O') + T('#3a8bff', 160, 130, 46, 'R'),
  ],
  gba: [
    G('#6c5cff', '<path d="M10 90 Q10 60 40 60 H160 Q190 60 190 90 V160 Q190 190 160 190 H40 Q10 190 10 160 Z"/><rect x="62" y="85" width="76" height="80"/>') + G('#c9c6ff', '<path d="M20 70 Q30 40 60 42 M180 70 Q170 40 140 42"/>'),
    G('#c9c6ff', '<circle cx="70" cy="140" r="26"/><circle cx="135" cy="105" r="26"/>') + T('#c9c6ff', 70, 151, 30, 'B') + T('#c9c6ff', 135, 116, 30, 'A') + T('#ff5ce1', 100, 215, 22, 'L · R'),
  ],
  psx: [PS_SHAPES, G('#8e9aa6', '<circle cx="100" cy="120" r="80"/><circle cx="100" cy="120" r="16"/>') + G('#3a8bff', '<path d="M45 80 A70 70 0 0 1 100 50"/>', 4)],
  ps2: [PS_SHAPES, G('#2f5cff', '<rect x="60" y="20" width="80" height="200" rx="4"/>') + G('#9fb8ff', '<path d="M70 70 h60 M70 80 h60 M100 120 v60"/>', 4)],
  psp: [PS_SHAPES, G('#7fd4ff', '<path d="M40 40 H160 V150 Q160 200 100 200 Q40 200 40 150 Z"/><circle cx="100" cy="120" r="34"/><circle cx="100" cy="120" r="8"/>')],
  n64: [
    G('#ffcc00', '<path d="M100 40 l18 22 h-36 Z M100 140 l18 -22 h-36 Z M50 90 l22 -18 v36 Z M150 90 l-22 -18 v36 Z"/>') + G('#3a6bff', '<circle cx="70" cy="190" r="22"/>') + G('#2aff6a', '<circle cx="135" cy="185" r="18"/>') +
      T('#3a6bff', 70, 200, 26, 'A') + T('#2aff6a', 135, 194, 22, 'B'),
    G('#8e929c', '<path d="M20 60 H180 V200 H20 Z"/><rect x="45" y="90" width="110" height="80"/>') + G('#ff2a2a', '<path d="M30 45 h35"/>', 4) + G('#ffcc00', '<path d="M70 45 h35"/>', 4) +
      G('#2aff6a', '<path d="M110 45 h35"/>', 4) + G('#3a6bff', '<path d="M150 45 h20"/>', 4),
  ],
  nds: [
    G('#e4e8ee', '<rect x="30" y="20" width="140" height="95" rx="8"/><rect x="30" y="125" width="140" height="95" rx="8"/>') + G('#4ac8ff', '<rect x="58" y="35" width="84" height="64"/><rect x="58" y="140" width="84" height="64"/>'),
    G('#e4e8ee', '<path d="M60 210 L150 40"/>', 4) + T('#4ac8ff', 100, 120, 28, 'TOUCH!', 'transform="rotate(-10 100 120)"'),
  ],
  atari2600: [
    G('#ff8a1e', '<rect x="40" y="150" width="120" height="70" rx="6"/><path d="M100 150 V50"/>') + G('#ff3b1e', '<circle cx="100" cy="40" r="14"/><circle cx="62" cy="170" r="10"/>'),
    G('#c8642a', '<path d="M20 70 Q60 60 100 72 T180 66 M20 100 Q60 90 100 102 T180 96 M20 130 Q60 120 100 132 T180 126"/>', 4) + G('#ff8a1e', '<path d="M20 180 h160 M20 200 h160"/>', 5),
  ],
  pce: [
    G('#ffffff', '<rect x="50" y="40" width="100" height="150" rx="10"/>') + G('#ff6a1f', '<path d="M65 190 v-24 M80 190 v-24 M95 190 v-24 M110 190 v-24 M125 190 v-24"/>', 4),
    T('#ff6a1f', 100, 110, 38, 'PC') + T('#ffffff', 100, 160, 30, 'ENGINE'),
  ],
};

const GLOW =
  '<defs><filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
  '<filter id="neon-glow-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

/** Neon drawings on both sides of the preview screen (decoration only). */
export function NeonMotifs({ system }: { system: string }) {
  const m = MOTIFS[system];
  if (!m) return null;
  return (
    <>
      {m.map((svg, i) => (
        // Static, trusted markup defined above.
        <svg key={i} className={`neon-motif ${i ? 'right' : 'left'}`} viewBox="0 0 200 240" aria-hidden dangerouslySetInnerHTML={{ __html: GLOW + svg }} />
      ))}
    </>
  );
}

/** Lit sign with the console's logo (or its name when there is no logo), centred in the top bar. */
export function NeonMarquee({ logo, name }: { logo?: string | undefined; name: string }) {
  return (
    <div className="neon-marquee" aria-hidden>
      {logo ? <img src={logo} alt="" draggable={false} /> : <span>{name}</span>}
    </div>
  );
}
