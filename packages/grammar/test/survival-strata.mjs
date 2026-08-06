/**
 * Two grammar primitives the stratified survival templates rest on.
 *
 * Run with: node test/survival-strata.mjs   (after pnpm build:toolkit)
 *
 * The SQL backend rejects `unnest`, so the two multi-value survival templates can
 * only be exercised here. Rather than reimplementing those templates in JS — which
 * would drift from the Python source of truth — this pins the two behaviours they
 * depend on, either of which an Arquero upgrade could change silently:
 *
 *   1. `unnest` applied to a *rollup's output* expands the collapsed rows without
 *      multiplying anything already counted. That is what lets a template read a
 *      multi-value attribute as it stood at one chosen event, rather than across
 *      the subject's whole timeline.
 *   2. `max` over a *nominal* column returns the string and skips nulls — which is
 *      how a per-subject attribute survives an aggregation at all.
 */
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());

// An event log in miniature: one row per event, a subject id, and an event-level
// attribute whose value differs between a subject's first and last event.
const EVENTS = [
  { subject: 's1', event: 'start', sites: 'Brain;Spine', day: 0 },
  { subject: 's1', event: 'death', sites: 'Liver', day: 10 },
  { subject: 's2', event: 'start', sites: 'Brain', day: 0 },
  { subject: 's2', event: 'visit', sites: 'Spine', day: 5 },
  // No value at all, at either event.
  { subject: 's3', event: 'start', sites: null, day: 0 },
  { subject: 's3', event: 'visit', sites: null, day: 7 },
];

const store = useDataSourcesStore();
const aq = await import('arquero');
store.seedDataSource('events', 'events', aq.from(EVENTS));

const run = (transformation) => {
  const result = store.getDataObject(['events'], transformation);
  assert.ok(result, 'expected a result table');
  return result.displayData;
};

// The value on the start event only, nulled elsewhere so the rollup below has
// exactly one candidate per subject — the shape the baseline templates use.
const baselineOnly = {
  derive: {
    'baseline sites': {
      if: { op: '==', left: { field: 'event' }, right: { literal: 'start' } },
      then: { field: 'sites' },
      else: { literal: null },
    },
  },
};

// 1. `max` carries a nominal value through a rollup: the string itself, not a
//    count, not null.
const perSubject = run([
  baselineOnly,
  { groupby: 'subject' },
  { rollup: { sites: { op: 'max', field: 'baseline sites' } } },
]);
assert.deepEqual(
  Object.fromEntries(perSubject.map((r) => [r.subject, r.sites])),
  // s1 keeps its *start* value, not the 'Liver' recorded at death. An all-null
  // group comes back `undefined` rather than `null` — worth pinning precisely,
  // though it makes no difference downstream: the templates screen these rows
  // out with a not-null filter, which treats both as absent (asserted below).
  { s1: 'Brain;Spine', s2: 'Brain', s3: undefined },
  'max over a nominal column should return the group’s string value',
);

// A subject with no value is excluded by the same not-null filter the templates
// use, whichever of null/undefined the aggregate produced.
const placeable = run([
  baselineOnly,
  { groupby: 'subject' },
  { rollup: { sites: { op: 'max', field: 'baseline sites' } } },
  { filter: { op: '!=', left: { field: 'sites' }, right: { literal: null } } },
]);
assert.deepEqual(
  placeable.map((r) => r.subject),
  ['s1', 's2'],
  'a subject with no value must be excluded, not carried as a null stratum',
);

// 2. Expanding a rollup's output multiplies nothing already aggregated: three
//    subject rows become one row per (subject, value), and a null expands to none.
const expanded = run([
  baselineOnly,
  { groupby: 'subject' },
  { rollup: { sites: { op: 'max', field: 'baseline sites' } } },
  { unnest: { field: 'sites', separator: ';' } },
]);
assert.deepEqual(
  expanded.map((r) => `${r.subject}:${r.sites}`).sort(),
  ['s1:Brain', 's1:Spine', 's2:Brain'],
  'unnest after a rollup should expand the collapsed rows, dropping the null',
);

// 3. Each subject is counted once per value it started with — the property that
//    makes overlapping cohorts meaningful rather than double-counted.
const cohorts = run([
  baselineOnly,
  { groupby: 'subject' },
  { rollup: { sites: { op: 'max', field: 'baseline sites' } } },
  { unnest: { field: 'sites', separator: ';' } },
  { groupby: 'sites' },
  { rollup: { subjects: { op: 'count' } } },
]);
assert.deepEqual(
  Object.fromEntries(cohorts.map((r) => [r.sites, r.subjects])),
  { Brain: 2, Spine: 1 },
  'cohorts should overlap by subject, not inflate by event',
);

// 4. The contrast that motivated two separate templates: expanding the *event*
//    rows instead reads every value the subject ever recorded, so s1 joins Liver
//    too and the totals no longer match the per-subject view above.
const everCohorts = run([
  { unnest: { field: 'sites', separator: ';' } },
  { groupby: ['subject', 'sites'] },
  { rollup: { events: { op: 'count' } } },
  { groupby: 'sites' },
  { rollup: { subjects: { op: 'count' } } },
]);
assert.deepEqual(
  Object.fromEntries(everCohorts.map((r) => [r.sites, r.subjects])),
  { Brain: 2, Spine: 2, Liver: 1 },
  'unnesting the event rows should read membership from the whole timeline',
);

console.log('survival-strata: all assertions passed');
