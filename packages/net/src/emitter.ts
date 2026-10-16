/** Minimal typed event emitter (no dependency, works in browsers and Node). */
export class Emitter<Events extends Record<string, unknown[]>> {
  private readonly handlers: { [K in keyof Events]?: Set<(...args: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, fn: (...args: Events[K]) => void): () => void {
    (this.handlers[event] ??= new Set()).add(fn);
    return () => this.handlers[event]?.delete(fn);
  }

  protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.handlers[event];
    if (!set) return;
    for (const fn of set) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[couch] ${String(event)} handler failed`, err);
      }
    }
  }
}
