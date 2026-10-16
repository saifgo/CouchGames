import type { SkinId } from '@couch/protocol';

export interface Settings {
  name: string;
  /** 'auto' follows the game on the TV. */
  skin: 'auto' | SkinId;
  stickMode: 'fixed' | 'floating';
  /** Radial dead zone, 0..0.5 of stick travel. */
  deadZone: number;
  /** Control size multiplier. */
  scale: number;
  opacity: number;
  /** Left-handed: swap left and right clusters. */
  mirror: boolean;
  haptics: boolean;
  /** Tilt the phone to drive a stick. */
  gyro: 'off' | 'left' | 'right';
  gyroSensitivity: number;
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  skin: 'auto',
  stickMode: 'fixed',
  deadZone: 0.12,
  scale: 1,
  opacity: 1,
  mirror: false,
  haptics: true,
  gyro: 'off',
  gyroSensitivity: 1,
  debug: false,
};

const KEY = 'couch.settings.v1';

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  try {
    const raw = safeStorage()?.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  safeStorage()?.setItem(KEY, JSON.stringify(s));
}

/** Stable per-device id; the TV uses it to give a reconnecting phone its old slot back. */
export function clientId(): string {
  const store = safeStorage();
  let id = store?.getItem('couch.clientId');
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    store?.setItem('couch.clientId', id);
  }
  return id;
}

export function lastSlot(room: string): number | null {
  const v = safeStorage()?.getItem(`couch.slot.${room}`);
  return v == null ? null : Number(v);
}

export function rememberSlot(room: string, slot: number): void {
  safeStorage()?.setItem(`couch.slot.${room}`, String(slot));
}
