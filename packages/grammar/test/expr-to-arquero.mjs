// Unit test for the Expr -> Arquero compiler. Asserts that every catalogued
// legacy expression form and its AST equivalent produce identical results on
// a real Arquero table. Run after `npm run build:all` (imports from dist).
import assert from 'node:assert/strict';
import { from } from 'arquero';
import { exprToArquero, isExpr } from '../dist/index.js';

const table = from([
  { f: 4, g: 2, name: 'a' },
  { f: null, g: 5, name: 'b' },
  { f: 10, g: 4, name: 'c' },
]);

// Each case: [description, legacy string, AST node]
const filterCases = [
  ["not-null filter d['f'] != null", "d['f'] != null", { op: '!=', left: { field: 'f' }, right: { literal: null } }],
  ["truthy filter d['f']", "d['f']", { field: 'f' }],
  ['comparison d.g > 2.5', "d['g'] > 2.5", { op: '>', left: { field: 'g' }, right: { literal: 2.5 } }],
];

for (const [desc, legacy, ast] of filterCases) {
  assert.ok(isExpr(ast), `isExpr should accept: ${desc}`);
  const expected = table.filter(legacy).objects();
  const actual = table.filter(exprToArquero(ast)).objects();
  assert.deepEqual(actual, expected, `filter parity: ${desc}`);
}

const deriveCases = [
  ['ratio d.f / d.g', "d['f'] / d['g']", { op: '/', left: { field: 'f' }, right: { field: 'g' } }],
  ['count() broadcast', 'count()', { agg: 'count' }],
  ["max(d['g']) broadcast", "max(d['g'])", { agg: 'max', field: 'g' }],
  ['rank()', 'rank()', { window: 'rank' }],
  [
    'ternary d.g == 2 ? yes : no',
    "d['g'] == 2 ? 'yes' : 'no'",
    {
      if: { op: '==', left: { field: 'g' }, right: { literal: 2 } },
      then: { literal: 'yes' },
      else: { literal: 'no' },
    },
  ],
  [
    'nested rank() == 1 ternary',
    "rank() == 1 ? 'largest' : 'not'",
    {
      if: { op: '==', left: { window: 'rank' }, right: { literal: 1 } },
      then: { literal: 'largest' },
      else: { literal: 'not' },
    },
  ],
];

for (const [desc, legacy, ast] of deriveCases) {
  assert.ok(isExpr(ast), `isExpr should accept: ${desc}`);
  const expected = table.derive({ out: legacy }).objects();
  const actual = table.derive({ out: exprToArquero(ast) }).objects();
  assert.deepEqual(actual, expected, `derive parity: ${desc}`);
}

// Field-name escaping: quotes and backslashes must not break the accessor.
const weird = from([{ "it's": 1, 'a\\b': 2 }]);
assert.equal(
  weird.derive({ out: exprToArquero({ field: "it's" }) }).objects()[0].out,
  1,
  'single-quote field name escapes correctly',
);
assert.equal(
  weird.derive({ out: exprToArquero({ field: 'a\\b' }) }).objects()[0].out,
  2,
  'backslash field name escapes correctly',
);

// Non-Expr shapes must be rejected by the guard (named filters, rolling).
assert.equal(isExpr({ name: 'sel1', source: 'donors' }), false, 'FilterDataSelection is not Expr');
assert.equal(isExpr({ rolling: { expression: 'count()' } }), false, 'RollingDeriveExpression is not Expr');
assert.equal(isExpr("d['f']"), false, 'string is not Expr');

// Untrusted input must throw, not compile.
for (const bad of [
  { op: 'eval', left: { field: 'f' }, right: { literal: 1 } },
  { agg: 'exec' },
  { window: 'row_number' },
  { literal: { nested: 'object' } },
  { field: '' },
]) {
  assert.throws(() => exprToArquero(bad), `should reject: ${JSON.stringify(bad)}`);
}

console.log('expr-to-arquero: all assertions passed');
