#!/usr/bin/env node
// Switch the chat between its two data modes by rewriting packages/chat/.env.local.
//
//   node scripts/set-chat-data-source.mjs [package]            # browser/CSV (default: hubmap)
//   node scripts/set-chat-data-source.mjs [package] --remote   # server-side/remote (default: penguins)
//
// Browser mode: VITE_UDI_DATA_PACKAGE=/data/<package>/datapackage.json and
// VITE_UDI_REMOTE_PACKAGE commented out. The package's CSVs must live under
// sample-data/ (synced into public/data by the `sync-data` step `pnpm dev:chat` runs).
//
// Remote mode: VITE_UDI_REMOTE_PACKAGE=<package> (takes precedence, routes the
// chat through the agent's /v1/yac query + metadata endpoints) and
// VITE_UDI_DATA_PACKAGE commented out. The package's data lives in a database
// the agent serves (seed it with seed_duckdb.py / seed_starrocks.py), not in
// sample-data/. Restart the chat dev server to pick up either change.
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const abs = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const ENV = abs('packages/chat/.env.local');
const TEMPLATE = abs('packages/chat/.env.example');
const SAMPLE_DATA = (pkg) => abs(`sample-data/${pkg}`);

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const pkg = args.find((a) => !a.startsWith('--')) ?? (remote ? 'penguins' : 'hubmap');

// Browser mode reads CSVs from sample-data/; remote reads from the agent's DB,
// so only the browser path requires a bundled package directory.
if (!remote && !existsSync(SAMPLE_DATA(pkg))) {
  console.error(`✗ sample-data/${pkg} not found — expected a bundled package directory there.`);
  process.exit(1);
}

// Ensure a working .env.local exists (mirrors setup.mjs).
if (!existsSync(ENV)) {
  copyFileSync(TEMPLATE, ENV);
  console.log('＋ created packages/chat/.env.local (from .env.example)');
}

/** Set KEY=value: replace the active line in place, else append. */
function setEnv(text, key, value) {
  const line = `${key}=${value}`;
  const active = new RegExp(`^${key}=.*$`, 'm');
  if (active.test(text)) return text.replace(active, line);
  return text.replace(/\n*$/, '') + `\n${line}\n`;
}

/** Comment out any active KEY= line so it stops taking effect. */
function unsetEnv(text, key) {
  return text.replace(new RegExp(`^(${key}=.*)$`, 'm'), '# $1');
}

let env = readFileSync(ENV, 'utf8');
if (remote) {
  env = setEnv(env, 'VITE_UDI_REMOTE_PACKAGE', pkg);
  env = unsetEnv(env, 'VITE_UDI_DATA_PACKAGE');
} else {
  env = setEnv(env, 'VITE_UDI_DATA_PACKAGE', `/data/${pkg}/datapackage.json`);
  env = unsetEnv(env, 'VITE_UDI_REMOTE_PACKAGE');
}
writeFileSync(ENV, env);

console.log(
  remote
    ? `✓ chat data source → remote package "${pkg}" (server-side query mode)\n` +
        '  VITE_UDI_DATA_PACKAGE disabled. Make sure the agent runs with UDI_QUERY_BACKENDS\n' +
        '  configured for this package, then restart the chat dev server to apply.'
    : `✓ chat data source → /data/${pkg}/datapackage.json (CSV / interactive mode)\n` +
        '  VITE_UDI_REMOTE_PACKAGE disabled. Restart the chat dev server to apply.',
);
