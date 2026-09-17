/**
 * Guards the library stylesheet against leaking into a host app.
 *
 * `udi-yac` is embedded in apps that are themselves Tailwind v4 + shadcn, using
 * the same token names and the same utility names we do. Three things therefore
 * have to hold, and all three are invisible in our own standalone app:
 *
 *   1. Our design tokens and element resets are scoped to the `.udi-yac` root
 *      class. Anything escaping to `:root`, `html` or `body` rethemes the host.
 *   2. Our utilities carry the `udi:` prefix. Unprefixed, they sit in the same
 *      layer as the host's at identical specificity, and whichever stylesheet
 *      loads last silently wins — a host's `.px-4` beating our `md:px-6`.
 *   3. Preflight is not shipped. Its `html, :host` and `*` rules cannot be
 *      scoped, and they reset the host's typography and box model.
 *
 * Run after `pnpm --filter udi-yac build:lib`:
 *   node test/no-global-css-leaks.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve, join, extname, relative } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

// --- 1. The built stylesheet ------------------------------------------------

let css;
try {
  css = readFileSync(join(root, 'dist/udi-yac.css'), 'utf8');
} catch {
  console.error('✗ dist/udi-yac.css not found — run `pnpm --filter udi-yac build:lib` first.');
  process.exit(1);
}

// Not flagged, deliberately: Tailwind's `:root,:host` block of `--udi-*` theme
// variables (prefixed, so it cannot collide with a host's) and its `*{--tw-*}`
// property defaults, which carry Tailwind's own values — a host already on
// Tailwind v4 emits the same declarations, so the duplication is a no-op.
const forbidden = [
  {
    // `:root{--background:` — our palette on the document root.
    pattern: /:root[^{]*\{[^}]*--background:/,
    why: 'shadcn color tokens on :root — scope them to .udi-yac (src/index.css)',
  },
  {
    // An *unprefixed* theme variable at :root overrides the host's own.
    pattern: /:root[^{]*\{[^}]*(?<!-)--font-sans:/,
    why: 'unprefixed --font-sans on :root — retypefaces the host; Tailwind must be imported with prefix(udi)',
  },
  {
    pattern: /(^|[},])\s*html\s*[,{]/,
    why: 'preflight is being shipped (`html, :host` block) — import tailwindcss/theme.css and tailwindcss/utilities.css, not the barrel',
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

for (const { pattern, why } of forbidden) if (pattern.test(css)) failures.push(why);

// Sanity check the other direction: the scoped tokens must actually be there,
// so a stylesheet that simply dropped them can't pass by having no leaks.
if (!/\.udi-yac[^{]*\{[^}]*--background:/.test(css)) {
  failures.push('no .udi-yac token block found — the scoped tokens are missing entirely');
}

// The reset preflight would have done must exist, scoped to our subtree.
const boxSizingRules = [...css.matchAll(/([^{}]+)\{([^{}]*box-sizing:\s*border-box[^{}]*)\}/g)];
if (boxSizingRules.length === 0) {
  failures.push('no `box-sizing: border-box` reset — shadcn components assume preflight');
}
for (const [, selector] of boxSizingRules) {
  // The vendored react-grid-layout / react-resizable sheets are global by
  // nature; a host using those libraries gets the same declarations anyway.
  if (selector.includes('.react-')) continue;
  if (!selector.includes('.udi-yac')) {
    failures.push(`unscoped box-model reset: \`${selector.trim().slice(0, 60)}\``);
  }
}

// A handful of very common utilities, as canaries: if any of them is emitted
// unprefixed, the prefix has been lost somewhere in the build.
const CANARIES = ['flex', 'grid', 'block', 'hidden', 'absolute', 'px-4', 'text-sm', 'w-full'];
for (const name of CANARIES) {
  if (new RegExp(`(^|[},])\\.${name}[,{]`).test(css)) {
    failures.push(`\`.${name}\` is emitted unprefixed — Tailwind's prefix(udi) is not in effect`);
  }
}

// udi-toolkit's Vue SFC styles are a separate sheet that its own dist entries
// never import; if our @import of it is dropped, <udi-vis> internals go unstyled.
if (!css.includes('data-v-')) {
  failures.push('udi-toolkit/style.css not bundled — <udi-vis> internals will be unstyled');
}

// --- 2. The source -----------------------------------------------------------
//
// An unprefixed class in a `className`/`cn()` literal is not an error anywhere:
// Tailwind simply emits no rule for it, and the element quietly loses that
// style. Only a source check catches it.

const ts = createRequire(join(root, 'noop.js'))('typescript');
const CLASS_CALLS = new Set(['cn', 'clsx', 'cva', 'twMerge']);
// Classes we own that are deliberately unprefixed: the library scope itself, the
// host-toggled dark marker, and our overrides of third-party sheets.
const ALLOWED =
  /^(udi:|udi-yac$|udi-grid-interacting$|dark$|dashboard-grid-|react-|group\/|peer\/)/;

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
  }
  return out;
};

function inClassContext(node) {
  // A quoted property *name* is a cva variant key (`'icon-sm': '…'`), not a class.
  if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) return false;
  // `orientation === 'vertical' && 'udi:overflow-x-hidden!'` — the operand of a
  // comparison inside cn() is a value being tested, never a class name.
  if (
    ts.isBinaryExpression(node.parent) &&
    node.parent.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    return false;
  }
  for (let n = node.parent; n; n = n.parent) {
    // cva()'s `defaultVariants` holds variant *keys*, not classes.
    if (ts.isPropertyAssignment(n) && n.name.getText() === 'defaultVariants') return false;
    if (ts.isJsxAttribute(n) && n.name.getText() === 'className') return true;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : '';
      if (CLASS_CALLS.has(name)) return true;
    }
  }
  return false;
}

for (const file of walk(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      inClassContext(node)
    ) {
      for (const token of node.text.split(/\s+/).filter(Boolean)) {
        if (!ALLOWED.test(token)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          failures.push(
            `${relative(root, file)}:${line + 1}: unprefixed class \`${token}\` — Tailwind emits nothing for it`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} CSS isolation problem(s):`);
  for (const why of failures) console.error(`  - ${why}`);
  process.exit(1);
}

console.log(
  '✓ tokens scoped to .udi-yac, no preflight, no global element rules, every utility prefixed',
);
