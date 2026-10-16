/**
 * 10-foot spatial navigation. Focusable elements carry `data-nav` (any value).
 * Directions come from the keyboard or from any phone's d-pad / stick
 * (edge-triggered with key-repeat). Confirm = bottom face (RetroPad B) or START,
 * back = right face (RetroPad A) or SELECT. That is the "bottom button confirms"
 * convention, consistent across every skin by position.
 */
import { Button, type InputState } from '@couch/protocol';

export type NavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'menu';
type Listener = (a: NavAction, slot: number) => boolean | void;

const listeners: Listener[] = [];

/** Handlers run newest-first; return true to stop propagation (modal scopes). */
export function onNav(fn: Listener): () => void {
  listeners.unshift(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function dispatchNav(a: NavAction, slot = -1): void {
  for (const fn of [...listeners]) if (fn(a, slot) === true) return;
  if (a === 'confirm') (document.activeElement as HTMLElement | null)?.click();
  else if (a === 'up' || a === 'down' || a === 'left' || a === 'right') moveFocus(a);
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** Nearest focusable in the given direction, within the innermost `[data-nav-scope]` around the current focus. */
export function moveFocus(dir: 'up' | 'down' | 'left' | 'right'): void {
  const current = document.activeElement as HTMLElement | null;
  const scope = (current?.closest('[data-nav-scope]') as HTMLElement | null) ?? document.querySelector<HTMLElement>('[data-nav-scope]') ?? document.body;
  const all = [...scope.querySelectorAll<HTMLElement>('[data-nav]')].filter((e) => visible(e) && !e.hasAttribute('disabled'));
  if (!all.length) return;
  if (!current || !all.includes(current)) {
    (scope.querySelector<HTMLElement>('[data-nav-default]') ?? all[0]!).focus();
    return;
  }
  const c = current.getBoundingClientRect();
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    let main: number;
    let cross: number;
    switch (dir) {
      case 'right':
        main = r.left - c.right + 1;
        cross = Math.abs(dy);
        if (dx <= 4) continue;
        break;
      case 'left':
        main = c.left - r.right + 1;
        cross = Math.abs(dy);
        if (dx >= -4) continue;
        break;
      case 'down':
        main = r.top - c.bottom + 1;
        cross = Math.abs(dx);
        if (dy <= 4) continue;
        break;
      case 'up':
        main = c.top - r.bottom + 1;
        cross = Math.abs(dx);
        if (dy >= -4) continue;
        break;
    }
    // Strongly prefer staying in the same row/column.
    const score = Math.max(0, main) + cross * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
}

/* --------------------------------------------------------- keyboard */

window.addEventListener('keydown', (e) => {
  const map: Record<string, NavAction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    Enter: 'confirm',
    ' ': 'confirm',
    Escape: 'back',
    Backspace: 'back',
    F1: 'menu',
  };
  const a = map[e.key];
  if (!a) return;
  const tag = (e.target as HTMLElement).tagName;
  if ((tag === 'INPUT' || tag === 'TEXTAREA') && a !== 'back' && a !== 'up' && a !== 'down') return;
  e.preventDefault();
  dispatchNav(a, -1);
});

/* ----------------------------------------------------- phone → nav */

const REPEAT_DELAY = 380;
const REPEAT_EVERY = 110;

interface PadNav {
  prev: number;
  dirHeld: NavAction | null;
  nextRepeat: number;
}

/** Turns phones' raw input into UI navigation with edge detection and key repeat. */
export class PhoneNavigator {
  private readonly state = new Map<number, PadNav>();
  enabled = true;
  private timer: ReturnType<typeof setInterval>;

  constructor() {
    this.timer = setInterval(() => this.repeat(), 30);
  }

  dispose(): void {
    clearInterval(this.timer);
  }

  feed(slot: number, s: InputState): void {
    let st = this.state.get(slot);
    if (!st) {
      st = { prev: 0, dirHeld: null, nextRepeat: 0 };
      this.state.set(slot, st);
    }
    let bits = s.buttons;
    // Sticks navigate too.
    if (s.ly < -80) bits |= 1 << Button.UP;
    if (s.ly > 80) bits |= 1 << Button.DOWN;
    if (s.lx < -80) bits |= 1 << Button.LEFT;
    if (s.lx > 80) bits |= 1 << Button.RIGHT;
    const pressed = bits & ~st.prev;
    st.prev = bits;
    if (pressed & (1 << Button.MENU)) this.fire('menu', slot);
    if (!this.enabled) return;
    const dir: NavAction | null =
      bits & (1 << Button.UP) ? 'up' : bits & (1 << Button.DOWN) ? 'down' : bits & (1 << Button.LEFT) ? 'left' : bits & (1 << Button.RIGHT) ? 'right' : null;
    if (dir !== st.dirHeld) {
      st.dirHeld = dir;
      if (dir) {
        this.fire(dir, slot);
        st.nextRepeat = performance.now() + REPEAT_DELAY;
      }
    }
    if (pressed & ((1 << Button.B) | (1 << Button.START))) this.fire('confirm', slot);
    if (pressed & ((1 << Button.A) | (1 << Button.SELECT))) this.fire('back', slot);
  }

  private repeat(): void {
    const now = performance.now();
    for (const [slot, st] of this.state) {
      if (st.dirHeld && now >= st.nextRepeat && this.enabled) {
        st.nextRepeat = now + REPEAT_EVERY;
        this.fire(st.dirHeld, slot);
      }
    }
  }

  private fire(a: NavAction, slot: number): void {
    dispatchNav(a, slot);
  }
}
