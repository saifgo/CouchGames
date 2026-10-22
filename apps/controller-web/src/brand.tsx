import { useMemo } from 'preact/hooks';
import { MARK_ON, markSvg } from '@couch/design';

/**
 * The CouchPad die-cut mark on Ink (docs/brand/identity.md). Once the phone has a player slot the
 * body may take the player's colour; everything else stays as drawn.
 */
export function Mark({ size, body, label }: { size: number; body?: string; label?: string }) {
  const html = useMemo(
    () => markSvg('cut', body ? { ...MARK_ON.ink, y: body } : MARK_ON.ink, `width="${size}" height="${Math.round((size * 120) / 156)}"`),
    [size, body],
  );
  return (
    <span
      class="mark"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** "CouchPad" in Fredoka 700, "Pad" in Yellow (allowed on Ink only). */
export function Wordmark() {
  return (
    <span class="wordmark">
      Couch<span class="pad-word">Pad</span>
    </span>
  );
}
