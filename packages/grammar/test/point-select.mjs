// Multi-select helpers (pointSelect.ts): which modifier picks how, the toggle
// a Ctrl/⌘-click applies, the range a Shift-click spans, and the Vega
// expression that dims unpicked marks. Imports the .ts source directly (Node
// strips types), so no dist build is needed.
import assert from 'node:assert/strict';
import * as vl from 'vega-lite';
import * as vega from 'vega';
import {
  fieldChannel,
  keyPickMode,
  pickModeOf,
  rangePicks,
  togglePointValues,
  pickDimTest,
  selectFields,
} from '../pointSelect.ts';

// Shift spans a range; Ctrl and ⌘ both toggle, and Shift wins over either.
assert.equal(pickModeOf({ shiftKey: true }), 'range');
assert.equal(pickModeOf({ ctrlKey: true }), 'toggle');
assert.equal(pickModeOf({ metaKey: true }), 'toggle');
assert.equal(pickModeOf({ shiftKey: true, metaKey: true }), 'range');
assert.equal(pickModeOf({}), null);
assert.equal(keyPickMode('Shift'), 'range');
assert.equal(keyPickMode('Control'), 'toggle');
assert.equal(keyPickMode('Meta'), 'toggle');
assert.equal(keyPickMode('a'), null);

// A range covers every category between its ends, in the scale's order, from
// either direction; numbers match their string form, as selections store them.
const races = ['Asian', 'Black', 'Other', 'Unknown', 'White'];
assert.deepEqual(rangePicks(races, 'Black', 'Unknown'), [
  'Black',
  'Other',
  'Unknown',
]);
assert.deepEqual(rangePicks(races, 'Unknown', 'Black'), [
  'Black',
  'Other',
  'Unknown',
]);
assert.deepEqual(rangePicks(races, 'Other', 'Other'), ['Other']);
assert.deepEqual(rangePicks([2019, 2020, 2021], '2021', '2019'), [
  '2019',
  '2020',
  '2021',
]);
// An end the domain doesn't hold: just the two ends.
assert.deepEqual(rangePicks(races, 'Black', 'Martian'), ['Black', 'Martian']);
assert.deepEqual(rangePicks([], 'Black', 'Black'), ['Black']);

// The channel a field is on, from the escaped Vega-Lite spec.
const layered = {
  layer: [
    { encoding: { x: { field: 'count' } } },
    { encoding: { theta: { field: 'n' }, color: { field: 'donor\\.race' } } },
  ],
};
assert.equal(fieldChannel(layered, 'donor.race'), 'color');
assert.equal(fieldChannel(layered, 'count'), 'x');
assert.equal(fieldChannel(layered, 'sex'), null);

// Toggle on from nothing, add a second value, toggle the first off, then the last.
let sel = togglePointValues(null, { org: 'CHOP' }, ['org']);
assert.deepEqual(sel, { org: ['CHOP'] });
sel = togglePointValues(sel, { org: 'UCSF' }, ['org']);
assert.deepEqual(sel, { org: ['CHOP', 'UCSF'] });
sel = togglePointValues(sel, { org: 'CHOP' }, ['org']);
assert.deepEqual(sel, { org: ['UCSF'] });
assert.equal(togglePointValues(sel, { org: 'UCSF' }, ['org']), null);

// Numbers are stored as strings, like the plain click path does.
assert.deepEqual(togglePointValues(null, { year: 2020 }, ['year']), {
  year: ['2020'],
});

// Multi-field: a mark counts as picked only when EVERY field already holds its
// value — (CHOP, Deceased) is not picked just because CHOP is.
sel = { org: ['CHOP'], event: ['Relapse'] };
assert.deepEqual(
  togglePointValues(sel, { org: 'CHOP', event: 'Deceased' }, ['org', 'event']),
  {
    org: ['CHOP'],
    event: ['Relapse', 'Deceased'],
  },
);
assert.equal(
  togglePointValues(sel, { org: 'CHOP', event: 'Relapse' }, ['org', 'event']),
  null,
);

// Field names are quoted, so a dotted or quoted name can't break the expression.
assert.equal(
  pickDimTest(['a.b']),
  'udi_pick && !((length(udi_pick["a.b"] || []) > 0) && ' +
    '(length(udi_pick["a.b"] || []) == 0 || indexof(udi_pick["a.b"], toString(datum["a.b"])) >= 0))',
);
assert.deepEqual(selectFields('x'), ['x']);
assert.deepEqual(selectFields(undefined), []);

// The Vega contract UDIVis relies on: a condition with no default branch
// leaves the mark's own opacity alone (0.7 for points) while the signal is
// null, and dims only the unpicked marks once it holds picks.
const spec = vl.compile({
  data: { values: [{ org: 'CHOP' }, { org: 'UCSF' }] },
  params: [{ name: 'udi_pick', value: null }],
  mark: 'point',
  encoding: {
    x: { field: 'org', type: 'nominal' },
    opacity: { condition: { test: pickDimTest(['org']), value: 0.25 } },
  },
}).spec;
const view = new vega.View(vega.parse(spec), { renderer: 'none' });
const opacities = () => {
  const out = {};
  const walk = (node) => {
    if (node?.datum?.org) out[node.datum.org] = node.opacity;
    for (const child of node?.items ?? []) walk(child);
  };
  walk(view.scenegraph().root);
  return out;
};
await view.runAsync();
assert.deepEqual(opacities(), { CHOP: 0.7, UCSF: 0.7 });
view.signal('udi_pick', { org: ['CHOP'] });
await view.runAsync();
assert.deepEqual(opacities(), { CHOP: 0.7, UCSF: 0.25 });
// A gesture that has picked nothing yet dims everything.
view.signal('udi_pick', {});
await view.runAsync();
assert.deepEqual(opacities(), { CHOP: 0.25, UCSF: 0.25 });

// Multi-field: a field with nothing picked matches any mark. A label click on a
// stacked bar picks only the axis field, and must keep every segment of that
// bar lit, whatever its color.
const stacked = vl.compile({
  data: {
    values: [
      { org: 'CHOP', sex: 'F' },
      { org: 'CHOP', sex: 'M' },
      { org: 'UCSF', sex: 'F' },
    ],
  },
  params: [{ name: 'udi_pick', value: null }],
  mark: 'point',
  encoding: {
    x: { field: 'org', type: 'nominal' },
    y: { field: 'sex', type: 'nominal' },
    opacity: {
      condition: { test: pickDimTest(['org', 'sex']), value: 0.25 },
    },
  },
}).spec;
const stackedView = new vega.View(vega.parse(stacked), { renderer: 'none' });
const stackedOpacities = () => {
  const out = {};
  const walk = (node) => {
    if (node?.datum?.org)
      out[`${node.datum.org}/${node.datum.sex}`] = node.opacity;
    for (const child of node?.items ?? []) walk(child);
  };
  walk(stackedView.scenegraph().root);
  return out;
};
stackedView.signal('udi_pick', { org: ['CHOP'] });
await stackedView.runAsync();
assert.deepEqual(stackedOpacities(), {
  'CHOP/F': 0.7,
  'CHOP/M': 0.7,
  'UCSF/F': 0.25,
});
// Both fields picked still means the cross product, as before.
stackedView.signal('udi_pick', { org: ['CHOP'], sex: ['F'] });
await stackedView.runAsync();
assert.deepEqual(stackedOpacities(), {
  'CHOP/F': 0.7,
  'CHOP/M': 0.25,
  'UCSF/F': 0.25,
});

console.log('point-select: ok');
