/**
 * Guards the library bundle against breaking server-side rendering at import.
 *
 * `udi-yac` is imported from route modules of SSR frameworks (Next, Remix, …),
 * where the module graph is evaluated in Node before anything renders. A
 * dependency that touches `window`/`document` at module scope therefore takes
 * the whole route down, even when the component itself is only ever rendered on
 * the client. That is invisible in our own SPA and in vitest (jsdom), so it
 * needs a build-output check in a bare Node process with no DOM globals.
 *
 * Run after `pnpm --filter udi-yac build:lib`:
 *   node test/ssr-import.mjs
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const bundlePath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/udi-yac.js');

if (!existsSync(bundlePath)) {
  console.error(`✗ ${bundlePath} not found — run \`pnpm --filter udi-yac build:lib\` first.`);
  process.exit(1);
}

// (Not `navigator`: Node ≥ 21 defines a minimal one itself.)
for (const name of ['window', 'document']) {
  if (name in globalThis) {
    console.error(
      `✗ \`${name}\` is defined in this process; run with a plain \`node\`, not jsdom.`,
    );
    process.exit(1);
  }
}

// React is a peer dependency and is intentionally external in the bundle, so
// it must be resolvable from here — it is a devDependency of this package.
let mod;
try {
  mod = await import(pathToFileURL(bundlePath).href);
} catch (err) {
  console.error('✗ importing dist/udi-yac.js in Node (no DOM) threw:');
  console.error(err);
  process.exit(1);
}

const missing = ['UDIChat', 'joinDataPath'].filter((name) => !(name in mod));
if (missing.length > 0) {
  console.error(`✗ bundle imported but is missing exports: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('✓ dist/udi-yac.js imports cleanly in Node without DOM globals');
