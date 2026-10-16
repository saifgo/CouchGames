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
      return;
    }
  } catch {
    /* needs a secure context (HTTPS) and a visible page */
  }
  if (!wakeLock) startNoSleepVideo();
}

let noSleep: HTMLVideoElement | null = null;

/**
 * Fallback for plain-HTTP LAN pages, where the Wake Lock API is unavailable:
 * a tiny muted, looping, playing video keeps mobile browsers from dimming the
 * screen. The frames come from a 2x2 canvas, so no media file is needed.
 * Must be started from a user gesture.
 */
function startNoSleepVideo(): void {
  if (noSleep) {
    void noSleep.play().catch(() => {});
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const ctx = canvas.getContext('2d');
  const stream = (canvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream?.(1);
  if (!ctx || !stream) return;
  let flip = false;
  setInterval(() => {
    flip = !flip;
    ctx.fillStyle = flip ? '#000' : '#010101';
    ctx.fillRect(0, 0, 2, 2);
  }, 1000);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.loop = true;
  v.setAttribute('playsinline', '');
  v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0';
  v.srcObject = stream;
  document.body.appendChild(v);
  noSleep = v;
  void v.play().catch(() => {});
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
