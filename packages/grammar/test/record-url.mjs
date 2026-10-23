// Record links (recordUrl.ts): only http(s) URLs are ever followed, a host
// function that throws yields no link, and only absolute URL cell values
// become links. Imports the .ts source directly (Node strips types).
import assert from 'node:assert/strict';
import { cellLink, recordLink, safeHref } from '../recordUrl.ts';

assert.equal(
  safeHref('https://example.org/a?b=1'),
  'https://example.org/a?b=1',
);
assert.equal(safeHref('http://example.org'), 'http://example.org/');
assert.equal(safeHref('javascript:alert(1)'), null);
assert.equal(safeHref('JavaScript:alert(1)'), null);
assert.equal(safeHref('data:text/html,<b>x</b>'), null);
assert.equal(safeHref(''), null);
assert.equal(safeHref(null), null);
assert.equal(safeHref(42), null);
// No document here, so a relative URL has no base to resolve against.
assert.equal(safeHref('/browse/HBM123'), null);

const byId = (row) => (row.id ? `https://example.org/${row.id}` : undefined);
assert.equal(
  recordLink(byId, { id: 'x1' }, 'donors'),
  'https://example.org/x1',
);
assert.equal(recordLink(byId, { count: 3 }, 'donors'), null);
assert.equal(recordLink(undefined, { id: 'x1' }, 'donors'), null);
assert.equal(
  recordLink(
    () => {
      throw new Error('host bug');
    },
    { id: 'x1' },
    'donors',
  ),
  null,
);
assert.equal(
  recordLink(() => 'javascript:alert(1)', {}, 'donors'),
  null,
);
let seenSource;
recordLink((_, source) => (seenSource = source), {}, 'samples');
assert.equal(seenSource, 'samples');

assert.equal(
  cellLink('https://dx.doi.org/10.17504/protocols.io.j8nlk1rowg5r/v1'),
  'https://dx.doi.org/10.17504/protocols.io.j8nlk1rowg5r/v1',
);
assert.equal(cellLink('see https://example.org'), null);
assert.equal(cellLink('https://example.org two'), null);
assert.equal(cellLink('/relative/path'), null);
assert.equal(cellLink('HBM123.ABCD.456'), null);
assert.equal(cellLink(12), null);

console.log('record-url: ok');
