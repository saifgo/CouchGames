/** Fullscreen, landscape lock and screen wake lock, all best-effort. */

let wakeLock: { release(): Promise<void> } | null = null;

export async function enterPlayMode(): Promise<void> {
  const doc = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (!document.fullscreenElement) {
      if (doc.requestFullscreen) await doc.requestFullscreen({ navigationUI: 'hide' });
      else await doc.webkitRequestFullscreen?.();
    }
  } catch {
    /* iOS Safari on iPhone has no element fullscreen; "Add to Home Screen" gives standalone mode instead */
  }
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    /* not supported outside fullscreen / on iOS */
  }
  await keepAwake();
}

export async function keepAwake(): Promise<void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
    if (nav.wakeLock && !wakeLock) {
      wakeLock = await nav.wakeLock.request('screen');
      (wakeLock as unknown as EventTarget).addEventListener?.('release', () => (wakeLock = null));
    }
  } catch {
    /* needs a secure context (HTTPS) and a visible page */
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void keepAwake();
});

/** Fills CSS vars --sal / --sar with the safe-area insets (notch) in px. */
export function measureSafeArea(): void {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:env(safe-area-inset-left);right:env(safe-area-inset-right);top:0;height:0;visibility:hidden';
  document.body.appendChild(probe);
  const r = probe.getBoundingClientRect();
  document.documentElement.style.setProperty('--sal', `${r.left}px`);
  document.documentElement.style.setProperty('--sar', `${window.innerWidth - r.right}px`);
  probe.remove();
}

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as { standalone?: boolean }).standalone === true;
