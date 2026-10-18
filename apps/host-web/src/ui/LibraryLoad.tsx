/**
 * Library loading feedback: the footer Refresh button turns into a progress bar while
 * the server's consoles load, and the empty preview shows the same progress.
 */
import { getSystem } from '@couch/systems';
import type { LibraryProgress } from '../library/library.js';

const names = (p: LibraryProgress) => p.loading.map((id) => getSystem(id)?.shortName ?? id).join(', ');

export function RefreshButton({ progress, libraryAt, onRefresh }: { progress: LibraryProgress | null; libraryAt: number | null; onRefresh: () => void }) {
  if (progress) {
    const finished = progress.done === progress.total;
    const pct = Math.round((progress.done / Math.max(1, progress.total)) * 100);
    const label = finished
      ? progress.failed.length
        ? `⚠ ${progress.failed.length} console${progress.failed.length > 1 ? 's' : ''} failed`
        : '✓ Library up to date'
      : `Loading ${names(progress) || 'library'}… ${progress.done}/${progress.total}`;
    return (
      <span className={`add lib-progress${finished ? ' finished' : ''}`} role="status" aria-live="polite">
        {!finished && <span className="spinner" aria-hidden />}
        <span className="lib-progress-label">{label}</span>
        <span className="lib-progress-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </span>
      </span>
    );
  }
  return (
    <button className="add" data-nav onClick={onRefresh} title={libraryAt ? `Library loaded ${new Date(libraryAt).toLocaleString()}. Press to check the server for new games.` : undefined}>
      ⟳ Refresh{libraryAt ? <small className="lib-age"> · {age(libraryAt)}</small> : null}
    </button>
  );
}

/** Shown instead of "No games yet" while the first load runs. */
export function LibraryLoading({ progress }: { progress: LibraryProgress }) {
  return (
    <div className="preview-empty lib-loading">
      <span className="spinner big" aria-hidden />
      <b>Loading your library…</b>
      <span>
        {progress.done} of {progress.total} consoles{progress.loading.length ? ` · now ${names(progress)}` : ''}
      </span>
    </div>
  );
}

function age(at: number): string {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
}
