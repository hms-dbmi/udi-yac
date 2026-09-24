/**
 * Guards the library bundle against module-level DOM access.
 *
 * A host that renders us from a Next/Remix/Astro route imports `udi-yac` on the
 * server. Anything that touches `document` or `window` while the module graph
 * evaluates takes that route down before a single component renders — and the
 * failure is frozen into the published tarball, so consumers cannot work around
 * it. Our own SPA never sees this, hence a build-output check.
 *
 * The usual culprit is a dependency's `browser` export condition: Vite resolves
 * it for a lib build, and some packages put real DOM calls at the top level of
 * that variant (decode-named-character-reference, via react-markdown, did).
 *
 * Run after `pnpm --filter udi-yac build:lib`, under plain Node (no jsdom):
 *   node test/ssr-import.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const entry = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/udi-yac.js');

for (const global of ['document', 'window']) {
  if (global in globalThis) {
    console.error(`✗ \`${global}\` exists in this process — run this under plain Node, not jsdom.`);
    process.exit(1);
  }
}

try {
  await import(entry);
} catch (error) {
  console.error(`✗ importing dist/udi-yac.js on the server failed: ${error.message}`);
  console.error(
    '  Something in the bundle touches the DOM at module scope. Find it with\n' +
      "  `grep -n '^var .*document\\.' dist/udi-yac.js` and alias the offending\n" +
      '  dependency to its non-browser entry in vite.config.ts.',
  );
  process.exit(1);
}

console.log('✓ dist/udi-yac.js imports cleanly with no DOM present');
