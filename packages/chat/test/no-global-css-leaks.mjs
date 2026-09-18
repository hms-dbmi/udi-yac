/**
 * Guards the library stylesheet against leaking into a host app.
 *
 * `udi-yac` is embedded in apps that are themselves Tailwind v4 + shadcn, using
 * the same token names we do. Our tokens and element resets are therefore scoped
 * to the `.udi-yac` root class; anything that escapes to `:root`, `html` or
 * `body` silently rethemes the host's entire UI, and root-absolute asset URLs
 * 404 against the host's origin. Both failure modes are invisible in our own
 * standalone app, so they need a build-time check.
 *
 * Run after `pnpm --filter udi-yac build:lib`:
 *   node test/no-global-css-leaks.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/udi-yac.css');

let css;
try {
  css = readFileSync(cssPath, 'utf8');
} catch {
  console.error(`✗ ${cssPath} not found — run \`pnpm --filter udi-yac build:lib\` first.`);
  process.exit(1);
}

// Not flagged, deliberately: Tailwind's own `:root,:host` theme blocks and its
// preflight (`html,:host{…}`, `*,::before…{…}`). Those carry Tailwind's default
// values, so a host already on Tailwind v4 emits the same declarations — the
// duplication is near enough a no-op. What matters is *our* palette and *our*
// element resets, which use bare `:root` / `html` / `body` selectors.
const forbidden = [
  {
    // `:root{--background:` — our palette on the document root.
    pattern: /:root[^{]*\{[^}]*--background:/,
    why: 'shadcn color tokens on :root — scope them to .udi-yac (src/index.css)',
  },
  {
    pattern: /(^|[},])\s*html\s*\{[^}]*font-family:/,
    why: "font-family on html — rethemes the host's typeface; set it on .udi-yac",
  },
  {
    pattern: /(^|[},])\s*body\s*\{[^}]*background-color:/,
    why: 'background-color on body — repaints the host page; set it on .udi-yac',
  },
  {
    pattern: /url\(\/assets\//,
    why: "root-absolute asset URL — 404s off the host's origin; vite `base` must be './' in lib mode",
  },
];

const failures = forbidden.filter(({ pattern }) => pattern.test(css));

// Sanity check the other direction: the scoped tokens must actually be there,
// so a stylesheet that simply dropped them can't pass by having no leaks.
if (!/\.udi-yac[^{]*\{[^}]*--background:/.test(css)) {
  failures.push({ why: 'no .udi-yac token block found — the scoped tokens are missing entirely' });
}

// udi-toolkit's Vue SFC styles are a separate sheet that its own dist entries
// never import; if our @import of it is dropped, <udi-vis> internals go unstyled.
if (!css.includes('data-v-')) {
  failures.push({
    why: 'udi-toolkit/style.css not bundled — <udi-vis> internals will be unstyled',
  });
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} CSS leak(s) in dist/udi-yac.css:`);
  for (const { why } of failures) console.error(`  - ${why}`);
  process.exit(1);
}

console.log('✓ dist/udi-yac.css: tokens scoped, no global element rules, no absolute asset URLs');
