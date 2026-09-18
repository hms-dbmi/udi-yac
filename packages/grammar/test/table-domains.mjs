// Guards TableUtil's domain derivation for row/table representations.
//
// Deriving a scale domain means scanning a whole column. An all-fields table
// (`field: '*'`) produces one text mapping per source column, and text cells
// never consult a scale — UDICellRenderer's getStyle switch has no 'text' case,
// its content comes from getTextValue. Computing domains for them anyway cost
// 258 full-column scans of a 9474-row source (measured 7.2s before
// transformedData became a shallowRef, 742ms after) for values nothing read.
//
// The risk of the fix is under-computing: if a mapping that DOES drive a scale
// stops getting a domain, in-cell bars/rects/points/colors silently mis-render.
// So this pins both directions.
//
// Imports the TypeScript source directly — Node strips the types. No dist build
// needed, and TableUtil stays out of the package's public API.
import assert from 'node:assert/strict';
import {
  computeFieldDomains,
  getDomainLookupKey,
  getNumberDomain,
  getStringDomain,
  mappingNeedsDomain,
} from '../TableUtil.ts';

const text = (field, extra = {}) => ({
  mark: 'text',
  encoding: 'text',
  field,
  column: field,
  type: 'nominal',
  ...extra,
});
const scaled = (encoding, field, type = 'quantitative', extra = {}) => ({
  mark: 'bar',
  encoding,
  field,
  column: field,
  type,
  ...extra,
});

const rows = [
  { a: 1, b: 'x', c: 10 },
  { a: 2, b: 'y', c: 20 },
  { a: 3, b: 'x', c: null },
];

// ── which encodings need a domain ────────────────────────────────────────────
// These are exactly the `case` labels in UDICellRenderer's getStyle switch.
for (const encoding of [
  'color',
  'x',
  'x2',
  'y',
  'yOffset',
  'xOffset',
  'size',
]) {
  assert.equal(
    mappingNeedsDomain(scaled(encoding, 'a')),
    true,
    `${encoding} drives a scale and needs a domain`,
  );
}
// getStyle has no case for either: text renders via getTextValue, shape is unhandled.
for (const encoding of ['text', 'shape']) {
  assert.equal(
    mappingNeedsDomain({ ...text('a'), encoding }),
    false,
    `${encoding} consults no scale`,
  );
}

// ── an all-fields text table derives nothing ─────────────────────────────────
const allText = Object.keys(rows[0]).map((f) => text(f));
assert.equal(
  computeFieldDomains(allText, rows).size,
  0,
  'a text-only mapping set scans no columns',
);

// ── but scaled mappings still get their domains ──────────────────────────────
const mixed = [text('b'), scaled('color', 'a'), scaled('size', 'c')];
const domains = computeFieldDomains(mixed, rows);
assert.equal(domains.size, 2, 'only the two scaled mappings produced domains');
assert.deepEqual(domains.get(getDomainLookupKey(scaled('color', 'a'))), {
  min: 1,
  max: 3,
});
assert.deepEqual(
  domains.get(getDomainLookupKey(scaled('size', 'c'))),
  { min: 10, max: 20 },
  'nulls are skipped rather than coerced to 0',
);
assert.equal(
  domains.has(getDomainLookupKey(text('b'))),
  false,
  'the text mapping was skipped',
);

// A nominal scaled mapping gets a category list, not an extent.
const nominal = computeFieldDomains([scaled('color', 'b', 'nominal')], rows);
assert.deepEqual(
  nominal.get(getDomainLookupKey(scaled('color', 'b', 'nominal'))),
  ['x', 'y'],
  'nominal domain is the distinct value list, deduped and null-free',
);

// ── explicit domains on the spec are honoured, not overwritten ───────────────
const explicitLiteral = computeFieldDomains(
  [scaled('x', 'a', 'quantitative', { domain: { min: 0, max: 100 } })],
  rows,
);
assert.deepEqual(
  [...explicitLiteral.values()][0],
  { min: 0, max: 100 },
  'a literal domain wins over the derived extent',
);

// A partial domain is completed from the data — the one case that falls through.
const partial = computeFieldDomains(
  [scaled('x', 'a', 'quantitative', { domain: { min: 0 } })],
  rows,
);
assert.deepEqual(
  [...partial.values()][0],
  { min: 0, max: 3 },
  'a partial domain keeps its explicit bound and derives the other',
);

// `numberFields` / `categoryFields` domains are derived across several columns.
const multi = computeFieldDomains(
  [scaled('x', 'a', 'quantitative', { domain: { numberFields: ['a', 'c'] } })],
  rows,
);
assert.deepEqual(
  [...multi.values()][0],
  { min: 1, max: 20 },
  'numberFields spans every listed column',
);

// ── mappings sharing a lookup key are derived once ───────────────────────────
// getDomainLookupKey is (column, field, type) — encoding is not part of it, so a
// skipped text mapping must not stop its scaled twin from populating the key.
const shared = computeFieldDomains(
  [{ ...text('a'), type: 'quantitative' }, scaled('color', 'a')],
  rows,
);
assert.deepEqual(
  shared.get(getDomainLookupKey(scaled('color', 'a'))),
  { min: 1, max: 3 },
  'the scaled twin still derives the shared key',
);

// ── null/empty inputs ────────────────────────────────────────────────────────
assert.equal(computeFieldDomains(null, rows).size, 0);
assert.equal(computeFieldDomains(allText, null).size, 0);
assert.equal(computeFieldDomains([], rows).size, 0);
assert.throws(() => getNumberDomain(rows, []), /Field list is empty/);
assert.throws(() => getStringDomain(rows, []), /Field list is empty/);

// ── coercion is reported once per field, not once per cell ───────────────────
// A wide table of string columns typed `quantitative` used to emit one
// console.warn per cell — millions of interpolated strings, enough to hang the
// tab on its own.
const warnings = [];
const realWarn = console.warn;
console.warn = (m) => warnings.push(m);
try {
  getNumberDomain(
    Array.from({ length: 500 }, (_, i) => ({ s: `v${i}` })),
    's',
  );
} finally {
  console.warn = realWarn;
}
assert.equal(warnings.length, 1, 'one warning for 500 coerced values');
assert.match(warnings[0], /coerced 500 value\(s\)/);

console.log('table-domains: all assertions passed');
