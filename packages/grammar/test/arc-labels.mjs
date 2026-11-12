// Pie and donut value labels (arcLabels.ts): each label lands in its own
// slice, reads "count (share)", and a donut's face away from the ring.
// Imports the .ts source directly (Node strips types), so no dist build is needed.
//
// Run with: node test/arc-labels.mjs
import assert from 'node:assert/strict';
import { compile } from 'vega-lite';
import * as vega from 'vega';
import { withArcLabels } from '../arcLabels.ts';

const rows = [
  { sex: 'Male', n: 7 },
  { sex: 'Female', n: 14 },
  { sex: null, n: 3 },
  { sex: 'Other', n: 1 },
];
// UDIVis pins the colour domain, which is what orders the arc stack.
const color = {
  field: 'sex',
  type: 'nominal',
  scale: { domain: ['Female', 'Male', 'Other', null] },
};
const arc = (extra = {}) => ({
  mark: { type: 'arc', tooltip: true },
  encoding: { theta: { field: 'n', type: 'quantitative' }, color, ...extra },
});

async function render(layers, values = rows, width = 300) {
  const spec = {
    width,
    height: 300,
    data: { values },
    layer: withArcLabels(layers, { textColor: '#123456', rows: values }),
  };
  const view = new vega.View(vega.parse(compile(spec).spec), {
    renderer: 'none',
  });
  await view.runAsync();
  const marks = view.scenegraph().root.items[0].items;
  const slices = marks.find((m) => m.marktype === 'arc').items;
  const labels = marks.filter(
    (m) => m.marktype === 'text' && m.role === 'mark',
  );
  return { slices, labels };
}

const mid = (slice) => (slice.startAngle + slice.endAngle) / 2;

// A pie: two passes (halo, then fill) at 60% of the radius, each label at its
// slice's middle angle.
{
  const { slices, labels } = await render([arc()]);
  assert.equal(labels.length, 2);
  assert.equal(labels[0].items[0].stroke, 'white');
  assert.equal(labels[1].items[0].stroke, undefined);
  const byText = {};
  for (const label of labels[1].items) {
    const slice = slices.find((s) => s.datum.sex === label.datum.sex);
    assert.ok(
      Math.abs(label.theta - mid(slice)) < 1e-9,
      `${label.datum.sex} label off its slice`,
    );
    assert.equal(label.radius, 300 * 0.3);
    byText[label.datum.sex] = label.text;
  }
  assert.deepEqual(byText, {
    Male: '7 (28%)',
    Female: '14 (56%)',
    null: '3 (12%)',
    Other: '',
  });
}

// A donut: one pass just outside the ring, in the chart's text colour, starting
// at the anchor on the right half and ending there on the left. With room, the
// ring keeps its size; in a narrow plot it shrinks, keeping its thickness.
const donut = arc({ radius: { value: 60 }, radius2: { value: 80 } });
for (const [width, outer] of [
  [300, 80],
  [220, 110 - (6 + '14 (00%)'.length * 0.55 * 11)],
]) {
  const { slices, labels } = await render([donut], rows, width);
  assert.equal(labels.length, 1);
  for (const slice of slices) {
    assert.ok(
      Math.abs(slice.outerRadius - outer) < 1e-9,
      `${width}: outer ${slice.outerRadius}`,
    );
    assert.ok(Math.abs(slice.innerRadius - outer * 0.75) < 1e-9);
  }
  for (const label of labels[0].items) {
    const slice = slices.find((s) => s.datum.sex === label.datum.sex);
    assert.ok(Math.abs(label.theta - mid(slice)) < 1e-9);
    assert.ok(Math.abs(label.radius - (outer + 6)) < 1e-9);
    assert.equal(label.fill, '#123456');
    assert.equal(label.align, Math.sin(mid(slice)) >= 0 ? 'left' : 'right');
  }
}

// A frequency rollup's values are shares already: they show once, as percents.
{
  const shares = rows.map((r) => ({ ...r, n: r.n / 25 }));
  const { labels } = await render([arc()], shares);
  const male = labels[1].items.find((l) => l.datum.sex === 'Male');
  assert.equal(male.text, '28%');
}

// No labels for a multi-ring chart or a rose chart.
const twoRings = [arc(), arc()];
assert.equal(withArcLabels(twoRings), twoRings);
const rose = [arc({ radius: { field: 'n', type: 'quantitative' } })];
assert.equal(withArcLabels(rose), rose);

console.log('arc-labels: ok');
