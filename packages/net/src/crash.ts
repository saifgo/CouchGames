/**
 * Minimal crash reporter (M6): uncaught errors and unhandled rejections are
 * POSTed to the local couch server (/api/crash → .cache/logs/crash.jsonl).
 * Deduplicated and rate-limited; never sent anywhere else.
 */
export function installCrashReporter(source: 'host-web' | 'controller-web', endpoint = '/api/crash'): void {
  if (typeof window === 'undefined') return;
  const seen = new Set<string>();
  let sent = 0;
  const report = (message: string, stack?: string) => {
    const key = `${message}|${stack?.slice(0, 200)}`;
    if (seen.has(key) || sent >= 20) return;
    seen.add(key);
    sent++;
    const body = JSON.stringify({
      source,
      message: message.slice(0, 500),
      stack: stack?.slice(0, 4000),
      url: location.pathname,
      userAgent: navigator.userAgent,
      at: new Date().toISOString(),
    });
    try {
      if (!navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) {
        void fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
      }
    } catch {
      /* never let the reporter throw */
    }
  };
  window.addEventListener('error', (e) => report(e.message || String(e.error), (e.error as Error | undefined)?.stack));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | string | undefined;
    report(typeof r === 'string' ? r : (r?.message ?? 'unhandled rejection'), typeof r === 'object' ? r?.stack : undefined);
  });
}
