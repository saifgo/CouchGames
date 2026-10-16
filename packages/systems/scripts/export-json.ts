/** Writes dist/systems.json for the Android TV host (single source of truth for systems/cores/tiers). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SYSTEMS } from '../src/index.js';

const out = fileURLToPath(new URL('../dist/', import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(`${out}systems.json`, JSON.stringify({ version: 1, systems: SYSTEMS }, null, 2));
console.log(`wrote ${out}systems.json`);
