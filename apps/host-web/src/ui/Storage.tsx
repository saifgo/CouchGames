/**
 * ROM storage status (local folder or S3 bucket) from the couch server's /api/storage:
 * a chip in the library footer, and a panel with details and a "Test again" button.
 */
import { useEffect, useState } from 'react';
import { getSystem } from '@couch/systems';
import { Modal } from './common.js';

interface StorageReport {
  store: { kind: 'local'; path: string } | { kind: 's3'; bucket: string; prefix: string; region: string; endpoint?: string };
  ok: boolean;
  error?: string;
  errorCode?: string;
  canList: boolean;
  canRead: boolean | null;
  games: number;
  perSystem: Record<string, number>;
  bios: string[];
  misplaced: { path: string; reason: string }[];
  misplacedTotal: number;
  truncated: boolean;
  checkedAt: string;
  ms: number;
}

/** 'none': the server has no ROM store (e.g. static hosting without the couch server). */
type State = { status: 'loading' } | { status: 'none' } | { status: 'done'; report: StorageReport } | { status: 'failed'; message: string };

async function fetchReport(fresh: boolean): Promise<State> {
  try {
    const res = await fetch(`/api/storage${fresh ? '?fresh' : ''}`);
    if (res.status === 404) return { status: 'none' };
    if (!res.ok) return { status: 'failed', message: `The server answered HTTP ${res.status}` };
    return { status: 'done', report: (await res.json()) as StorageReport };
  } catch {
    return { status: 'failed', message: "Can't reach the CouchPad server" };
  }
}

const where = (r: StorageReport) => (r.store.kind === 's3' ? `${r.store.bucket}/${r.store.prefix}` : r.store.path);

export function StorageChip() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void fetchReport(false).then(setState);
  }, []);
  if (state.status === 'none') return null;

  const r = state.status === 'done' ? state.report : null;
  const tone = state.status === 'loading' ? 'wait' : r?.ok ? (r.misplacedTotal ? 'warn' : 'good') : 'bad';
  const kind = r?.store.kind === 's3' ? 'S3' : r ? 'Folder' : 'Storage';
  const text =
    state.status === 'loading' ? 'checking…' : !r ? 'unreachable' : r.ok ? `${r.games} game${r.games === 1 ? '' : 's'}` : 'not connected';
  return (
    <>
      <button className={`add storage-chip ${tone}`} data-nav onClick={() => setOpen(true)} title={r ? where(r) : undefined}>
        <span className="dot" aria-hidden /> {kind} · {text}
      </button>
      {open && <StoragePanel state={state} onRetest={async () => setState(await fetchReport(true))} onClose={() => setOpen(false)} />}
    </>
  );
}

function StoragePanel({ state, onRetest, onClose }: { state: State; onRetest: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const r = state.status === 'done' ? state.report : null;
  const retest = async () => {
    setBusy(true);
    await onRetest();
    setBusy(false);
  };
  const tick = (v: boolean | null) => (v === null ? '–' : v ? '✓' : '✗');
  return (
    <Modal onClose={onClose} className="storage">
      <h1>ROM storage</h1>
      {!r ? (
        <p className="storage-status bad">{state.status === 'failed' ? state.message : 'Checking…'}</p>
      ) : (
        <>
          <p className={`storage-status ${r.ok ? 'good' : 'bad'}`}>
            <span className="dot" aria-hidden /> {r.ok ? 'Connected' : 'Not connected'}
            {r.error && <span className="storage-error">{r.error}</span>}
          </p>
          <dl className="storage-facts">
            {r.store.kind === 's3' ? (
              <>
                <dt>Bucket</dt>
                <dd>{r.store.bucket}</dd>
                <dt>Prefix</dt>
                <dd>{r.store.prefix || '(bucket root)'}</dd>
                <dt>Region</dt>
                <dd>{r.store.region}</dd>
                {r.store.endpoint && (
                  <>
                    <dt>Endpoint</dt>
                    <dd>{r.store.endpoint}</dd>
                  </>
                )}
              </>
            ) : (
              <>
                <dt>Folder</dt>
                <dd>{r.store.path}</dd>
              </>
            )}
            <dt>List files</dt>
            <dd>{tick(r.canList)}</dd>
            <dt>Read files</dt>
            <dd>{tick(r.canRead)}</dd>
            <dt>Games</dt>
            <dd>
              {r.games}
              {r.truncated && '+'}
              {r.games > 0 &&
                ` (${Object.entries(r.perSystem)
                  .map(([id, n]) => `${getSystem(id)?.shortName ?? id} ${n}`)
                  .join(' · ')})`}
            </dd>
            <dt>BIOS</dt>
            <dd>{r.bios.length ? r.bios.join(', ') : 'none'}</dd>
            {r.errorCode && (
              <>
                <dt>Error code</dt>
                <dd>{r.errorCode}</dd>
              </>
            )}
            <dt>Checked</dt>
            <dd>
              {new Date(r.checkedAt).toLocaleTimeString()} ({r.ms} ms)
            </dd>
          </dl>
          {r.misplacedTotal > 0 && (
            <div className="storage-misplaced">
              <h2>
                {r.misplacedTotal} file{r.misplacedTotal > 1 ? 's' : ''} not picked up
              </h2>
              <ul>
                {r.misplaced.map((m) => (
                  <li key={m.path}>
                    <code>{m.path}</code> {m.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.ok && r.games === 0 && !r.misplacedTotal && (
            <p className="facts-text">
              Connected, but there are no games yet. Put files at <code>{'<system>/<file>'}</code> {r.store.kind === 's3' && r.store.prefix ? `under ${r.store.prefix}` : ''}, for
              example <code>snes/Game.sfc</code>.
            </p>
          )}
        </>
      )}
      <div className="storage-actions">
        <button className="add" data-nav data-nav-default disabled={busy} onClick={() => void retest()}>
          {busy ? 'Testing…' : 'Test again'}
        </button>
        <button className="add" data-nav onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
