// Unit test for the query backend seam: singleton set/reset, remote batching
// (N concurrent queries → 1 POST), per-vizId fan-out, extent→allData mapping,
// null semantics for missing results, and all-reject on HTTP failure.
// Run after `npm run build:all` (imports from dist).
import assert from 'node:assert/strict';
import {
  setQueryBackend,
  getQueryBackend,
  createRemoteBackend,
  LOCAL_BACKEND,
} from '../dist/index.js';

// ── singleton ────────────────────────────────────────────────────────────────
assert.equal(getQueryBackend(), LOCAL_BACKEND, 'default backend is local');
assert.equal(
  getQueryBackend().interactive,
  true,
  'local backend is interactive',
);

// ── batching + fan-out ───────────────────────────────────────────────────────
const calls = [];
const fakeFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url, headers: init.headers, body });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: {
        // q1 gets display + extent; q2 display only; q3 intentionally missing
        [body.queries[0].vizId]: {
          displayData: [{ a: 1 }],
          extent: [{ a: 1 }, { a: 2 }],
          isSubset: true,
        },
        [body.queries[1]?.vizId]: { displayData: [{ b: 2 }] },
      },
    }),
  };
};

const backend = createRemoteBackend({
  url: 'https://example.test/v1/yac/query',
  packageName: 'pkg1',
  headers: { Authorization: 'Bearer t' },
  fetchFn: fakeFetch,
});
setQueryBackend(backend);
assert.equal(
  getQueryBackend(),
  backend,
  'setQueryBackend installs the backend',
);
assert.equal(backend.interactive, false, 'remote backend is not interactive');

const src = [{ name: 'donors', source: 'donors.tsv' }];
const sel1 = {
  brush1: {
    dataSourceKey: 'donors',
    selection: { age: [1, 2] },
    type: 'interval',
  },
};
const sel2 = {
  brush2: { dataSourceKey: 'donors', selection: { sex: ['F'] }, type: 'point' },
};

// Three queries in the same tick → ONE POST.
const [r1, r2, r3] = await Promise.all([
  backend.query({
    source: src,
    transformation: [{ groupby: 'sex' }],
    selections: sel1,
  }),
  backend.query({ source: src, selections: sel2 }),
  backend.query({ source: src }),
]);

assert.equal(calls.length, 1, 'concurrent queries batched into one request');
const sent = calls[0];
assert.equal(sent.url, 'https://example.test/v1/yac/query');
assert.equal(
  sent.headers.Authorization,
  'Bearer t',
  'custom headers forwarded',
);
assert.equal(sent.body.package, 'pkg1');
assert.equal(sent.body.queries.length, 3, 'all queries in the batch');
assert.deepEqual(
  Object.keys(sent.body.selections).sort(),
  ['brush1', 'brush2'],
  'selections merged across the batch',
);
assert.deepEqual(sent.body.queries[0].transformation, [{ groupby: 'sex' }]);

assert.deepEqual(r1.displayData, [{ a: 1 }]);
assert.deepEqual(r1.allData, [{ a: 1 }, { a: 2 }], 'extent maps to allData');
assert.equal(r1.isSubset, true);
assert.deepEqual(r2.displayData, [{ b: 2 }]);
assert.deepEqual(
  r2.allData,
  [{ b: 2 }],
  'missing extent falls back to displayData',
);
assert.equal(r2.isSubset, false, 'missing isSubset defaults false');
assert.equal(r3, null, 'missing vizId resolves null (keep previous data)');

// A later query is a NEW batch.
await backend.query({ source: src });
assert.equal(calls.length, 2, 'later query starts a second batch');

// ── error semantics ──────────────────────────────────────────────────────────
const failing = createRemoteBackend({
  url: 'https://example.test/v1/yac/query',
  fetchFn: async () => ({ ok: false, status: 503, json: async () => ({}) }),
});
const outcomes = await Promise.allSettled([
  failing.query({ source: src }),
  failing.query({ source: src }),
]);
assert.ok(
  outcomes.every(
    (o) => o.status === 'rejected' && /HTTP 503/.test(String(o.reason)),
  ),
  'HTTP failure rejects every query in the batch',
);

// ── pending subscription ─────────────────────────────────────────────────────
const transitions = [];
const pendingBackend = createRemoteBackend({
  url: 'https://example.test/v1/yac/query',
  fetchFn: async (url, init) => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: Object.fromEntries(
        JSON.parse(init.body).queries.map((q) => [
          q.vizId,
          { displayData: [] },
        ]),
      ),
    }),
  }),
});
const unsubscribe = pendingBackend.subscribePending((p) => transitions.push(p));
await Promise.all([
  pendingBackend.query({ source: src }),
  pendingBackend.query({ source: src }),
]);
assert.deepEqual(
  transitions,
  [true, false],
  'one pending on/off cycle per batch round-trip',
);
unsubscribe();
await pendingBackend.query({ source: src });
assert.equal(transitions.length, 2, 'unsubscribed callback no longer fires');

// ── reset ────────────────────────────────────────────────────────────────────
setQueryBackend(null);
assert.equal(
  getQueryBackend(),
  LOCAL_BACKEND,
  'setQueryBackend(null) resets to local',
);

console.log('query-backend: all assertions passed');
