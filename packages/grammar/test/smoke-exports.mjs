/**
 * Smoke test for the package's public surface:
 *
 *  1. every `exports` target resolves to a file that exists;
 *  2. `ce.d.ts` — hand-written, and what `exports["./ce"].types` points at —
 *     declares everything `ce-entry.ts` exports at runtime. It drifted once
 *     already: `UDIPalette` was exported by the module but absent from the
 *     types, so a TS consumer could not name the type of the `palette` prop.
 *
 * Run from the package root after `npm run build:all`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkgPath = resolve(import.meta.dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

const errors = [];

// Check that every export entry points to a file that exists
for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (typeof target === 'string') {
    // Simple string export (e.g. "./style.css")
    const fullPath = resolve(import.meta.dirname, '..', target);
    try {
      readFileSync(fullPath);
    } catch {
      errors.push(`exports["${subpath}"] -> ${target} does not exist`);
    }
  } else {
    // Conditional export object
    for (const [condition, file] of Object.entries(target)) {
      const fullPath = resolve(import.meta.dirname, '..', file);
      try {
        readFileSync(fullPath);
      } catch {
        errors.push(`exports["${subpath}"].${condition} -> ${file} does not exist`);
      }
    }
  }
}

// --- 2. ce.d.ts covers ce-entry.ts -----------------------------------------

/** Names introduced by `export` statements, ignoring what they re-export from. */
function exportedNames(source) {
  const names = new Set();
  // `export { a, b as c } from '...'` and `export type { … }`
  for (const m of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name.replace(/^type\s+/, ''));
    }
  }
  // `export interface X`, `export function X`, `export declare const X`, …
  for (const m of source.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_$]+)/g,
  )) {
    names.add(m[1]);
  }
  return names;
}

const read = (name) => readFileSync(resolve(import.meta.dirname, '..', name), 'utf-8');
const runtime = exportedNames(read('ce-entry.ts'));
const declared = exportedNames(read('ce.d.ts'));
for (const name of runtime) {
  if (!declared.has(name)) {
    errors.push(`ce-entry.ts exports \`${name}\` but ce.d.ts does not declare it`);
  }
}

if (errors.length) {
  console.error('Exports smoke test FAILED:');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(
  `Exports smoke test passed ✓ (${Object.keys(pkg.exports).length} subpaths, ` +
    `${runtime.size} ./ce exports verified)`,
);
