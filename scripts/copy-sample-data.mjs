#!/usr/bin/env node
// Copy the canonical sample-data/ into a consumer's static dir.
// Single source of truth lives at repo-root sample-data/; each frontend
// (chat, grammar-app) syncs it into its own public/data on dev/build so the
// data ships in the bundle. Storybook mounts sample-data/ directly via
// staticDirs and does not use this script.
//
// Usage: node ../../scripts/copy-sample-data.mjs <dest-dir>   (dest is CWD-relative)
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../sample-data', import.meta.url));
const dest = process.argv[2];
if (!dest) {
  console.error('usage: copy-sample-data.mjs <dest-dir>');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`sample-data → ${dest}`);
