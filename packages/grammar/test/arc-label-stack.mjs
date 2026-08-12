// Guards the Vega-level contract the labelled donut template relies on: a text
// layer must sit at the MIDPOINT of the arc it names.
//
// Run with: node test/arc-label-stack.mjs   (no dist build needed)
//
// Labelling a donut has three requirements, and each alone still renders:
//
//   1. `stack: true` on the label layer's theta. An `arc` mark stacks theta
//      implicitly, so each slice spans the angles its predecessors did not; a
//      `text` mark does not, so without this a label sits at `scale(theta, value)`
//      — the angle the raw value maps to, which for every slice but the first is
//      inside a different wedge.
//   2. The SAME `color` encoding on the label layer. Stack order is decided per
//      layer from that layer's own encodings, so a text layer without one orders
//      by its own text instead of by the colour category — reversed, as it turns
//      out, putting every label on somebody else's slice.
//   3. NOT suppressing that colour's legend. One shared colour scale means
//      vega-lite merges the two layers into a single legend by itself; hiding this
//      layer's hides the shared one, taking the category names off the chart.
//
// (2) is the dangerous one: every number is right, every label is over a wedge,
// and nothing looks wrong — which is why this measures angles instead of trusting
// a screenshot. All three are pinned below, in both directions.
import assert from 'node:assert/strict';
import * as vl from 'vega-lite';
import * as vega from 'vega';

const VALUES = [
  { c: 'a', p: 0.5, l: '50 (50%)' },
  { c: 'b', p: 0.3, l: '30 (30%)' },
  { c: 'd', p: 0.2, l: '20 (20%)' },
];

// The shape UDIVis emits for the donut: two layers over one dataset, each with
// its own theta encoding and the ring at radius 60-80. No scale override — the
// converter adds `scale.zero: false` for x/y/size only, deliberately leaving
// theta alone, because arc stacking needs the scale to start at zero.
function donut({ stackLabels, colorLabels, hideLabelLegend }) {
  const theta = (extra) => ({
    field: 'p',
    type: 'quantitative',
    ...extra,
  });
  return {
    data: { values: VALUES },
    width: 300,
    height: 300,
    layer: [
      {
        mark: 'arc',
        encoding: {
          theta: theta({}),
          color: { field: 'c', type: 'nominal' },
          radius: { value: 60 },
          radius2: { value: 80 },
        },
      },
      {
        mark: 'text',
        encoding: {
          theta: theta(stackLabels ? { stack: true } : {}),
          radius: { value: 100 },
          text: { field: 'l', type: 'nominal' },
          ...(colorLabels
            ? {
                color: {
                  field: 'c',
                  type: 'nominal',
                  ...(hideLabelLegend ? { legend: null } : {}),
                },
              }
            : {}),
        },
      },
    ],
  };
}

async function render(spec) {
  const view = new vega.View(vega.parse(vl.compile(spec).spec), {
    renderer: 'none',
  });
  await view.runAsync();
  // Keyed by the row's category rather than by position: vega-lite chooses the
  // stacking order itself, so pairing a label to a slice by array index would
  // pass or fail for reasons that have nothing to do with stacking.
  const arcs = new Map();
  const labels = new Map();
  for (const group of view.scenegraph().root.items[0].items) {
    for (const item of group.items ?? []) {
      if (group.marktype === 'arc') {
        // Vega emits these DESCENDING (startAngle > endAngle), so the wedge is
        // the interval between them either way round. Ordering them here rather
        // than assuming: a comparison against an inverted interval is vacuously
        // false and would make this test pass for the wrong reason.
        const [start, end] = [item.startAngle, item.endAngle].sort(
          (a, b) => a - b,
        );
        arcs.set(item.datum.c, { start, end });
      } else if (group.marktype === 'text') {
        labels.set(item.datum.c, { text: item.text, theta: item.theta });
      }
    }
  }
  return { arcs, labels };
}

const offItsSlice = ({ arcs, labels }) =>
  [...labels].filter(([category, label]) => {
    const arc = arcs.get(category);
    return !(label.theta > arc.start && label.theta < arc.end);
  });

// --- what the template does: stack the labels AND share the colour ----------
const good = await render(donut({ stackLabels: true, colorLabels: true }));
assert.equal(good.arcs.size, 3, 'expected three slices');
assert.equal(good.labels.size, 3, 'expected one label per slice');

// Every label centred on the wedge it names — the property a reader depends on,
// and the only one that makes the number meaningful.
for (const [category, label] of good.labels) {
  const arc = good.arcs.get(category);
  const mid = (arc.start + arc.end) / 2;
  assert.ok(
    Math.abs(label.theta - mid) < 1e-9,
    `label ${label.text} at ${label.theta} is not centred on its slice ` +
      `[${arc.start}, ${arc.end}] (midpoint ${mid})`,
  );
}
assert.equal(offItsSlice(good).length, 0, 'no label may sit off its slice');

// --- neither half of that is optional ---------------------------------------
// Without `stack`, a label sits at the angle its raw value maps to.
const unstacked = await render(
  donut({ stackLabels: false, colorLabels: true }),
);
assert.ok(
  offItsSlice(unstacked).length > 0,
  'without stack:true at least one label must land off its slice — if this ' +
    'passes, vega-lite began stacking theta for text marks and the template ' +
    'no longer needs to ask for it',
);

// And with `stack` but no shared colour the layer stacks in its OWN order,
// derived from its own encodings, which is not the ring's. This is the case that
// renders convincingly and mislabels every slice — it was caught here, not by
// eye, because three plausible numbers on three slices look correct. Every label
// lands on *a* slice; just not the one whose number it carries.
const uncoloured = await render(
  donut({ stackLabels: true, colorLabels: false }),
);
const arcSpans = [...uncoloured.arcs.values()];
const onSomeSlice = [...uncoloured.labels].filter(([, label]) =>
  arcSpans.some((arc) => label.theta > arc.start && label.theta < arc.end),
);
assert.equal(
  onSomeSlice.length,
  3,
  'sanity: the labels are still drawn over the ring, so this is invisible',
);
assert.equal(
  offItsSlice(uncoloured).length,
  3,
  'a text layer with no colour encoding must stack in a different order from ' +
    'the ring — if it no longer does, the shared colour encoding is only ' +
    'cosmetic and this test is no longer guarding anything',
);

// --- (3) the shared legend --------------------------------------------------
// Compiled, not rendered: the count of legends is a property of the spec.
const legendCount = (spec) => (vl.compile(spec).spec.legends ?? []).length;
assert.equal(
  legendCount(donut({ stackLabels: true, colorLabels: true })),
  1,
  'the two layers share one colour scale, so exactly one legend should be ' +
    'emitted — two would mean the scales stopped being shared, and with them ' +
    'the stack order the labels depend on',
);
assert.equal(
  legendCount(
    donut({ stackLabels: true, colorLabels: true, hideLabelLegend: true }),
  ),
  0,
  'hiding the label layer’s legend hides the SHARED one, which is why the ' +
    'template does not set omitLegend there',
);

console.log('arc-label-stack: all assertions passed');
