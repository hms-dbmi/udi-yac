/**
 * The grammar primitives the stratified survival templates rest on.
 *
 * Run with: node test/survival-strata.mjs   (after pnpm build:toolkit)
 *
 * The SQL backend rejects `unnest`, so the two multi-value survival templates can
 * only be exercised here. Rather than reimplementing those templates in JS — which
 * would drift from the Python source of truth — this pins the behaviours they
 * depend on, any of which an Arquero upgrade could change silently:
 *
 *   1. `unnest` applied to a *rollup's output* expands the collapsed rows without
 *      multiplying anything already counted. That is what lets a template read a
 *      multi-value attribute as it stood at one chosen event, rather than across
 *      the subject's whole timeline.
 *   2. `max` over a *nominal* column returns the string and skips nulls — which is
 *      how a per-subject attribute survives an aggregation at all.
 *   3. A `left` join keeps the rows with no match, which is the only way to say a
 *      subject is *absent* from another table — the stratifier the presence
 *      templates split by. The inner-join contrast is asserted alongside it.
 *   4. `unnest` applied to a *join's output*, on a column that arrived from the
 *      joined side, expands it the same way it expands a plain source. That is
 *      what the cross-table multi-value template rests on, and it stacks two
 *      row multiplications — the join's and the expansion's — which the
 *      per-(subject, value) reduction downstream has to absorb unchanged.
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

// 5. Presence in another table as a stratifier. Absence is only expressible with a
//    LEFT join — an inner one drops exactly the subjects whose answer is "no" — and
//    the side table has to be reduced to one row per subject first, or a subject
//    with two records joins its group twice.
store.seedDataSource(
  'radiation',
  'radiation',
  aq.from([
    { subject: 's1', site: 'head' },
    { subject: 's1', site: 'spine' },
    // Present here but absent from the event log: must not invent a cohort member.
    { subject: 's9', site: 'head' },
  ]),
);

const presence = store.getDataObject(
  ['events', 'radiation'],
  [
    { groupby: 'subject', in: 'radiation' },
    {
      rollup: { marker: { op: 'count' } },
      in: 'radiation',
      out: 'rad_by_subject',
    },
    {
      join: { on: ['subject', 'subject'], kind: 'left' },
      in: ['events', 'rad_by_subject'],
      out: 'events_p',
    },
    {
      derive: {
        group: {
          if: { op: '!=', left: { field: 'marker' }, right: { literal: null } },
          then: { literal: 'Radiation' },
          else: { literal: 'No Radiation' },
        },
      },
    },
    { groupby: 'subject' },
    { rollup: { group: { op: 'max', field: 'group' } } },
    { groupby: 'group' },
    { rollup: { subjects: { op: 'count' } } },
  ],
).displayData;
assert.deepEqual(
  Object.fromEntries(presence.map((r) => [r.group, r.subjects])),
  // s1 once despite two radiation rows; s2 and s3 in the "no" group; s9 nowhere.
  { Radiation: 1, 'No Radiation': 2 },
  'a left join must keep the unmatched subjects and count each subject once',
);

// The same pipeline with an inner join loses the "no" group entirely — the failure
// this shape exists to avoid, pinned so `kind` cannot be dropped unnoticed.
const inner = store.getDataObject(
  ['events', 'radiation'],
  [
    { groupby: 'subject', in: 'radiation' },
    {
      rollup: { marker: { op: 'count' } },
      in: 'radiation',
      out: 'rad_by_subject',
    },
    {
      join: { on: ['subject', 'subject'] },
      in: ['events', 'rad_by_subject'],
      out: 'events_p',
    },
    { groupby: 'subject' },
    { rollup: { events: { op: 'count' } } },
  ],
).displayData;
assert.deepEqual(
  inner.map((r) => r.subject),
  ['s1'],
  'an inner join drops the subjects that answer "no" — hence kind: left',
);

// 6. A delimited column arriving from the *joined* side. The cross-table
//    multi-value template unnests here rather than on a plain source, and two
//    multiplications stack: the join fans each event out per related record, the
//    expansion fans each of those out per listed value. Neither may reach the
//    answer, because the reduction below is min/max over a (subject, value)
//    group and both are idempotent under duplication.
store.seedDataSource(
  'therapy',
  'therapy',
  aq.from([
    // Two regimens, one of them listing two agents: both multiplications at once.
    { subject: 's1', agents: 'Brain;Spine' },
    { subject: 's1', agents: 'Liver' },
    { subject: 's2', agents: 'Brain' },
    // Related record but no events: must not invent a cohort member.
    { subject: 's9', agents: 'Kidney' },
  ]),
);

const relatedMulti = store.getDataObject(
  ['events', 'therapy'],
  [
    {
      join: { on: ['subject', 'subject'] },
      in: ['events', 'therapy'],
      out: 'events_t',
    },
    { unnest: { field: 'agents', separator: ';' } },
    { groupby: 'subject' },
    // The subject's whole span, broadcast onto every one of its (now heavily
    // duplicated) rows — exactly what the template does before regrouping.
    {
      derive: {
        'subject start': { agg: 'min', field: 'day' },
        'subject end': { agg: 'max', field: 'day' },
      },
    },
    { groupby: ['subject', 'agents'] },
    {
      rollup: {
        start: { op: 'min', field: 'subject start' },
        end: { op: 'max', field: 'subject end' },
      },
    },
  ],
).displayData;

assert.deepEqual(
  relatedMulti
    .map((r) => `${r.subject}:${r.agents}:${r.start}-${r.end}`)
    .sort(),
  // s1 joins all three of its agents and carries the same 0-10 span into each;
  // s2 joins Brain with its own 0-5 span; s3 has no therapy row and leaves the
  // inner join; s9 has no events and never appears.
  ['s1:Brain:0-10', 's1:Liver:0-10', 's1:Spine:0-10', 's2:Brain:0-5'],
  'unnesting a joined column must expand it without disturbing the per-subject span',
);

const relatedCohorts = store.getDataObject(
  ['events', 'therapy'],
  [
    {
      join: { on: ['subject', 'subject'] },
      in: ['events', 'therapy'],
      out: 'events_t',
    },
    { unnest: { field: 'agents', separator: ';' } },
    { groupby: ['subject', 'agents'] },
    { rollup: { rows: { op: 'count' } } },
    { groupby: 'agents' },
    { rollup: { subjects: { op: 'count' } } },
  ],
).displayData;
assert.deepEqual(
  Object.fromEntries(relatedCohorts.map((r) => [r.agents, r.subjects])),
  // Overlapping, and counted once per subject rather than once per duplicated
  // row: s1 is in three groups, not in six.
  { Brain: 2, Spine: 1, Liver: 1 },
  'cohorts should overlap by subject, not inflate by joined row or listed value',
);

console.log('survival-strata: all assertions passed');
