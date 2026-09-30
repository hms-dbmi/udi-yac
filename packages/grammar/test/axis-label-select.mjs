// Guards category labels (axisLabelSelect.ts, used by VegaLite.vue) on a bar
// chart's axis and a color legend: which guide gets them and whether it is
// clickable, the totals their tooltip
// shows, the gray-out of emptied categories, the underline geometry, and the
// Vega contract the patch relies on — that a compiled Vega-Lite axis accepts a
// mark name, interactivity, and a tooltip and opacity reading a signal. That
// last part breaks silently if a vega upgrade changes how guide encode blocks
// merge.
//
// Imports the TypeScript source directly — Node strips the types.
import assert from 'node:assert/strict';
import * as vl from 'vega-lite';
import * as vega from 'vega';
import {
  CLICKABLE_LABELS,
  CLICKABLE_LEGEND,
  CLICKABLE_LEGEND_SYMBOLS,
  EMPTY_LABEL_OPACITY,
  LABEL_TOTALS_SIGNAL,
  LEGEND_TOTALS_SIGNAL,
  categoryTotals,
  findLabelAxis,
  findLabelLegend,
  patchLabelAxis,
  patchLabelLegend,
  underlineGeometry,
} from '../axisLabelSelect.ts';

const bar = (encoding, mark = { type: 'bar' }) => ({
  layer: [{ mark, encoding }],
});
const nominal = (field, title) => ({
  field,
  type: 'nominal',
  ...(title ? { title } : {}),
});
const quantitative = (field, title) => ({
  field,
  type: 'quantitative',
  ...(title ? { title } : {}),
});

// ── which axis ───────────────────────────────────────────────────────────────
assert.deepEqual(
  findLabelAxis(bar({ x: nominal('race', 'Race'), y: quantitative('count') }), [
    'race',
    'sex',
  ]),
  {
    channel: 'x',
    field: 'race',
    title: 'Race',
    clickable: true,
    measure: 'count',
    measureTitle: 'count',
  },
);
// Horizontal bars put the categories on y.
assert.equal(
  findLabelAxis(bar({ x: quantitative('count'), y: nominal('race') }), ['race'])
    ?.channel,
  'y',
);
// Dotted names arrive escaped for Vega-Lite; selections use the raw name.
assert.equal(
  findLabelAxis(bar({ x: nominal('donor\\.race'), y: quantitative('n') }), [
    'donor.race',
  ])?.field,
  'donor.race',
);
// No selection on the axis field: the axis still grays out, but isn't clickable.
assert.equal(
  findLabelAxis(bar({ x: nominal('race'), y: quantitative('n') }), ['sex'])
    ?.clickable,
  false,
);
// Not a bar chart: no category axis.
assert.equal(
  findLabelAxis(
    bar({ x: nominal('race'), y: quantitative('n') }, { type: 'point' }),
    ['race'],
  ),
  null,
);

// ── which legend ─────────────────────────────────────────────────────────────
assert.deepEqual(
  findLabelLegend(
    bar({
      x: quantitative('count', 'Donors'),
      y: nominal('race'),
      color: nominal('sex', 'Sex'),
    }),
    ['race', 'sex'],
  ),
  {
    channel: 'color',
    field: 'sex',
    title: 'Sex',
    clickable: true,
    measure: 'count',
    measureTitle: 'Donors',
  },
);
// Any mark: a pie's measure is its angle.
assert.equal(
  findLabelLegend(
    bar({ theta: quantitative('n'), color: nominal('sex') }, { type: 'arc' }),
    ['sex'],
  )?.measure,
  'n',
);
// Not in the selection: grays out, isn't clickable. Dotted names unescaped.
assert.deepEqual(
  (({ field, clickable }) => ({ field, clickable }))(
    findLabelLegend(bar({ color: nominal('donor\\.sex') }), ['race']),
  ),
  { field: 'donor.sex', clickable: false },
);
// A color ramp or no color: no category legend.
assert.equal(findLabelLegend(bar({ color: quantitative('n') }), ['n']), null);
assert.equal(findLabelLegend(bar({ x: nominal('race') }), ['race']), null);

// ── totals ───────────────────────────────────────────────────────────────────
const axis = findLabelAxis(
  bar({ x: nominal('race', 'Race'), y: quantitative('count', 'Donors') }),
  ['race'],
);
const rows = [
  { race: 'White', sex: 'F', count: 4 },
  { race: 'White', sex: 'M', count: 2 },
  { race: 'Asian', sex: 'F', count: 1 },
  { race: null, sex: 'F', count: 3 },
];
assert.deepEqual(categoryTotals(rows, axis), { White: 6, Asian: 1, null: 3 });
// Without a measure, a category's total is its row count — still a key per
// category that has rows, which is what the gray-out tests.
assert.deepEqual(categoryTotals(rows, { ...axis, measure: undefined }), {
  White: 2,
  Asian: 1,
  null: 1,
});

// ── underline geometry ───────────────────────────────────────────────────────
const box = { x: 10, y: -12, width: 40, height: 14 };
assert.deepEqual(
  underlineGeometry(box, (x, y) => ({ x: x + 100, y: y + 50 })),
  { left: 110, top: 52, width: 40, angle: 0 },
);
// A label the axis turns by -90° gets an underline turned with it.
const turned = underlineGeometry(box, (x, y) => ({ x: y, y: -x }));
assert.equal(turned.width, 40);
assert.equal(turned.angle, -Math.PI / 2);

// ── the Vega contract ────────────────────────────────────────────────────────
const compiled = () =>
  vl.compile({
    data: { name: 'udi_data', values: rows },
    width: 200,
    height: 100,
    layer: [
      {
        mark: 'bar',
        encoding: {
          x: nominal('race', 'Race'),
          y: quantitative('count', 'Donors'),
          color: nominal('sex'),
        },
      },
    ],
  }).spec;
const spec = patchLabelAxis(compiled(), axis);
const view = new vega.View(vega.parse(spec), { renderer: 'none' });
view.signal(LABEL_TOTALS_SIGNAL, categoryTotals(rows, axis));
await view.runAsync();

const axisLabels = (v) => {
  const found = [];
  const walk = (node) => {
    if (node?.marktype === 'text' && node.role === 'axis-label')
      found.push(node);
    for (const child of node?.items ?? []) walk(child);
  };
  walk(v.scenegraph().root);
  return found;
};
const labelMarks = axisLabels(view).filter((m) => m.name === CLICKABLE_LABELS);
assert.equal(labelMarks.length, 1, 'exactly the x axis gets clickable labels');
assert.equal(labelMarks[0].interactive, true);
const tooltips = Object.fromEntries(
  labelMarks[0].items.map((item) => [String(item.datum.value), item.tooltip]),
);
assert.deepEqual(tooltips.White, { Race: 'White', Donors: '6' });
assert.deepEqual(tooltips.Asian, { Race: 'Asian', Donors: '1' });

// The totals follow the data: a new signal value re-encodes the labels.
view.signal(LABEL_TOTALS_SIGNAL, { White: 1234.567 });
await view.runAsync();
const white = labelMarks[0].items.find((item) => item.datum.value === 'White');
assert.deepEqual(white.tooltip, { Race: 'White', Donors: '1,234.57' });
const asian = labelMarks[0].items.find((item) => item.datum.value === 'Asian');
assert.deepEqual(asian.tooltip, { Race: 'Asian', Donors: '0' });
// Asian has no rows left, so its label grays out; White keeps full opacity.
assert.equal(asian.opacity, EMPTY_LABEL_OPACITY);
assert.equal(white.opacity, 1);

// An axis that isn't clickable still grays out, without becoming interactive.
const plainView = new vega.View(
  vega.parse(patchLabelAxis(compiled(), { ...axis, clickable: false })),
  { renderer: 'none' },
);
plainView.signal(LABEL_TOTALS_SIGNAL, { White: 6 });
await plainView.runAsync();
// The x axis's labels: the mark holding the category values.
const plainLabels = axisLabels(plainView).find((m) =>
  m.items.some((item) => item.datum.value === 'White'),
);
assert.equal(plainLabels.name, undefined);
assert.notEqual(plainLabels.interactive, true);
const opacityOf = (value) =>
  plainLabels.items.find((item) => item.datum.value === value).opacity;
assert.equal(opacityOf('White'), 1);
assert.equal(opacityOf('Asian'), EMPTY_LABEL_OPACITY);
assert.equal(opacityOf(null), EMPTY_LABEL_OPACITY);

// The legend: labels and symbols both clickable, both grayed out when empty.
const legend = findLabelLegend(
  bar({
    x: nominal('race'),
    y: quantitative('count', 'Donors'),
    color: nominal('sex', 'Sex'),
  }),
  ['race', 'sex'],
);
const legendMarks = async (patched, totals) => {
  const v = new vega.View(vega.parse(patched), { renderer: 'none' });
  v.signal(LEGEND_TOTALS_SIGNAL, totals);
  await v.runAsync();
  // Each legend entry is its own group, holding one symbol mark and one label
  // mark; collect every entry's.
  const found = { 'legend-label': [], 'legend-symbol': [] };
  const walk = (node) => {
    found[node?.role]?.push(node);
    for (const child of node?.items ?? []) walk(child);
  };
  walk(v.scenegraph().root);
  return found;
};
const clickableLegend = await legendMarks(
  patchLabelLegend(compiled(), legend),
  {
    F: 8,
  },
);
const legendLabels = clickableLegend['legend-label'];
const legendSymbols = clickableLegend['legend-symbol'];
assert.ok(legendLabels.length > 0 && legendSymbols.length > 0);
assert.ok(
  legendLabels.every((m) => m.name === CLICKABLE_LEGEND && m.interactive),
);
assert.ok(
  legendSymbols.every(
    (m) => m.name === CLICKABLE_LEGEND_SYMBOLS && m.interactive,
  ),
);
const entry = (marks, value) =>
  marks.flatMap((m) => m.items).find((item) => item.datum.value === value);
assert.deepEqual(entry(legendLabels, 'F').tooltip, { Sex: 'F', Donors: '8' });
// M has no rows left: label and swatch gray out; F keeps full opacity.
assert.equal(entry(legendLabels, 'M').opacity, EMPTY_LABEL_OPACITY);
assert.equal(entry(legendSymbols, 'M').opacity, EMPTY_LABEL_OPACITY);
assert.equal(entry(legendLabels, 'F').opacity, 1);
assert.equal(entry(legendSymbols, 'F').opacity, 1);

// Not clickable: still grays out, but no names or interactivity.
const plainLegend = await legendMarks(
  patchLabelLegend(compiled(), { ...legend, clickable: false }),
  { F: 8 },
);
assert.ok(plainLegend['legend-label'].every((m) => m.name === undefined));
assert.ok(plainLegend['legend-symbol'].every((m) => !m.interactive));
assert.equal(
  entry(plainLegend['legend-label'], 'M').opacity,
  EMPTY_LABEL_OPACITY,
);
assert.equal(entry(plainLegend['legend-symbol'], 'F').opacity, 1);

console.log('axis-label-select: ok');
