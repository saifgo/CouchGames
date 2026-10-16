/**
 * Haptics.
 * - Android / Chromium: Vibration API.
 * - iOS Safari has no Vibration API. Since Safari 17.4, toggling an
 *   `<input type="checkbox" switch>` produces a system haptic tick, so we keep a
 *   hidden one and click its label from inside the touch handler. Only short
 *   ticks are possible this way, so rumble becomes a few ticks.
 */
export const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let iosLabel: HTMLLabelElement | null = null;
function iosSwitch(): HTMLLabelElement {
  if (iosLabel) return iosLabel;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.body.appendChild(label);
  iosLabel = label;
  return label;
}

export class Haptics {
  enabled = true;

  get supported(): boolean {
    return canVibrate || isIOS;
  }

  /** Short tick on a button press. Call from inside the input event handler. */
  tap(): void {
    if (!this.enabled) return;
    if (canVibrate) navigator.vibrate(8);
    else if (isIOS) iosSwitch().click();
  }

  /** Game rumble forwarded from the core. */
  rumble(strong: number, weak: number, durationMs: number): void {
    if (!this.enabled || durationMs <= 0) return;
    const intensity = Math.max(strong, weak) / 255;
    if (intensity < 0.05) {
      if (canVibrate) navigator.vibrate(0);
      return;
    }
    if (canVibrate) {
      // Approximate amplitude with a duty cycle (the API has no amplitude control).
      if (intensity > 0.7) navigator.vibrate(durationMs);
      else {
        const on = Math.max(6, Math.round(14 * intensity));
        const off = 14 - Math.min(13, on);
        const pattern: number[] = [];
        for (let t = 0; t < durationMs; t += on + off) pattern.push(on, off);
        navigator.vibrate(pattern);
      }
    } else if (isIOS) {
      // Outside a user gesture this may be ignored; best effort.
      const ticks = Math.min(4, Math.ceil(durationMs / 80));
      for (let i = 0; i < ticks; i++) setTimeout(() => iosSwitch().click(), i * 70);
    }
  }
}
