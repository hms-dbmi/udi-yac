#!/usr/bin/env node
// Point the chat at a bundled data package in CSV / interactive (browser)
// mode — the reset-to-CSV-dumps switch. Rewrites packages/chat/.env.local so
// VITE_UDI_DATA_PACKAGE=/data/<package>/datapackage.json and comments out
// VITE_UDI_REMOTE_PACKAGE (which otherwise takes precedence and puts the chat
// in server-side/remote mode). Restart the chat dev server to pick it up.
//
//   node scripts/set-chat-data-source.mjs [package]   # default: hubmap
//
// Data lands in packages/chat/public/data via the `sync-data` step that
// `pnpm dev:chat` runs, so the package's CSVs must live under sample-data/.
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const abs = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const ENV = abs('packages/chat/.env.local');
const TEMPLATE = abs('packages/chat/.env.example');
const SAMPLE_DATA = (pkg) => abs(`sample-data/${pkg}`);

const pkg = process.argv[2] ?? 'hubmap';

if (!existsSync(SAMPLE_DATA(pkg))) {
  console.error(
    `✗ sample-data/${pkg} not found — expected a bundled package directory there.`,
  );
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
env = setEnv(env, 'VITE_UDI_DATA_PACKAGE', `/data/${pkg}/datapackage.json`);
env = unsetEnv(env, 'VITE_UDI_REMOTE_PACKAGE');
writeFileSync(ENV, env);

console.log(
  `✓ chat data source → /data/${pkg}/datapackage.json (CSV / interactive mode)\n` +
    '  VITE_UDI_REMOTE_PACKAGE disabled. Restart the chat dev server to apply.',
);
