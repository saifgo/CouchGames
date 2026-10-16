#!/usr/bin/env node
/**
 * Dev mode: couch server (:8787, serves /c from the controller build) + host-web
 * Vite dev server (:5173, proxies API/WS to :8787) + controller rebuild on save.
 * Open http://localhost:5173 on the TV/laptop; the QR points phones at :8787.
 */
import { spawn } from 'node:child_process';

const procs = [
  ['server', 'pnpm', ['--filter', '@couch/signaling', 'dev']],
  ['controller', 'pnpm', ['--filter', '@couch/controller-web', 'exec', 'vite', 'build', '--watch']],
  ['host', 'pnpm', ['--filter', '@couch/host-web', 'dev']],
];
const children = procs.map(([name, cmd, args]) => {
  const c = spawn(cmd, args, { shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
  const tag = `[${name}]`.padEnd(13);
  c.stdout.on('data', (d) => process.stdout.write(String(d).replace(/^/gm, tag)));
  c.stderr.on('data', (d) => process.stderr.write(String(d).replace(/^/gm, tag)));
  return c;
});
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
