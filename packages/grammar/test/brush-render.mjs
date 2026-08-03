// Guards the Vega-level contract the brush render-back relies on
// (VegaLite.vue updateVegaChart -> updateVegaChartSelections): after a data
// changeset + resize, writing an EXTERNAL selection's data range to the
// per-channel signals must reposition the rendered 2D brush rectangle. This
// is what makes "editing a filter's sliders moves the brush" work; it would
// break silently on an incompatible vega/vega-lite upgrade.
//
// Runs against dev deps (vega, vega-lite) — no dist build needed.
import assert from 'node:assert/strict';
import * as vl from 'vega-lite';
import * as vega from 'vega';

// Locked scale domains — what setDefaultDomains emits, keeping pixel mapping
// stable across data changes (the condition the fix depends on).
const spec = vl.compile({
  data: {
    name: 'udi_data',
    values: [
      { a: 100, b: 200 },
      { a: 1500, b: 1600 },
      { a: 3000, b: 3100 },
      { a: 5000, b: 5200 },
    ],
  },
  width: 300,
  height: 300,
  layer: [
    {
      mark: { type: 'point' },
      params: [{ name: 'br', select: { type: 'interval', encodings: ['x', 'y'] } }],
      encoding: {
        x: { field: 'a', type: 'quantitative', scale: { domain: [0, 5200] } },
        y: { field: 'b', type: 'quantitative', scale: { domain: [0, 5200] } },
      },
    },
  ],
}).spec;

const view = new vega.View(vega.parse(spec), { renderer: 'none' });
await view.runAsync();

const sx = () => view.scale('x');
const sy = () => view.scale('y');

function brushRect() {
  let out = null;
  const walk = (item) => {
    if (!item) return;
    if ((item.name || '') === 'br_brush') {
      for (const c of item.items ?? []) {
        if (c.width != null) out = { x: c.x, w: c.width, y: c.y, h: c.height };
      }
    }
    for (const c of item.items ?? []) if (typeof c === 'object') walk(c);
  };
  walk(view.scenegraph().root);
  return out;
}

// Establish an initial 2D brush (data a,b in [1000,2000]).
view.signal('br_x', [sx()(1000), sx()(2000)]);
view.signal('br_y', [sy()(1000), sy()(2000)]);
await view.runAsync();
const before = brushRect();
assert.ok(before && before.w > 0 && before.h > 0, 'initial brush renders a rect');

// Simulate updateVegaChart: data changeset to the filtered subset + resize,
// WITHOUT restoring pixel signals (external-selection case skips that).
view.change('udi_data', vega.changeset().remove(() => true).insert([{ a: 1500, b: 1600 }]));
await view.resize().runAsync();

// Simulate the final re-assert (updateVegaChartSelections) writing the edited
// range (a,b in [3000,4000]) in data space against current scales.
view.signal('br_x', [sx()(3000), sx()(4000)]);
view.signal('br_y', [sy()(3000), sy()(4000)]);
await view.runAsync();
const after = brushRect();

assert.ok(after && after.w > 0 && after.h > 0, 'brush still renders after rebuild + re-assert');
// The edited range is higher on x and higher on y (screen-y grows downward,
// so a higher data-y sits nearer the top → smaller y pixel). The key
// assertion: the rect MOVED to the new range rather than staying put.
assert.ok(after.x > before.x, `brush x moved right for the higher range (before ${before.x}, after ${after.x})`);
assert.ok(after.y < before.y, `brush y moved up for the higher range (before ${before.y}, after ${after.y})`);

// And it lands where the new data range maps (within a pixel).
const expX = Math.min(sx()(3000), sx()(4000));
const expY = Math.min(sy()(3000), sy()(4000));
assert.ok(Math.abs(after.x - expX) < 1, `brush x at new range (${after.x} vs ${expX})`);
assert.ok(Math.abs(after.y - expY) < 1, `brush y at new range (${after.y} vs ${expY})`);

// --- Guards updateVegaChartSelection's resolution path (VegaLite.vue) ---
// It reads the interval's field->channel map via `view.signal('_tuple_fields')`
// (NOT getState().signals, which can omit it), resolves each selection field's
// channel, and writes that channel's pixel signal. Reproduce that exact logic
// from a data-space range and assert the brush lands correctly.
const tupleFields = view.signal('br_tuple_fields');
assert.ok(Array.isArray(tupleFields), 'tuple fields read via view.signal() is an array');
const channelForField = (f) => tupleFields.find((t) => t.field === f)?.channel;
assert.equal(channelForField('a'), 'x', 'field a resolves to channel x');
assert.equal(channelForField('b'), 'y', 'field b resolves to channel y');

// Apply a data-space selection {a:[500,1500], b:[2000,4000]} the way the
// component does: resolve channel per field, convert to pixels, write.
const selection = { a: [500, 1500], b: [2000, 4000] };
for (const [field, range] of Object.entries(selection)) {
  const channel = channelForField(field);
  const scale = channel === 'x' ? sx() : sy();
  view.signal(`br_${channel}`, [scale(range[0]), scale(range[1])]);
}
await view.runAsync();
const resolved = brushRect();
assert.ok(
  Math.abs(resolved.x - Math.min(sx()(500), sx()(1500))) < 1,
  `resolved brush x matches field a range (${resolved.x})`,
);
assert.ok(
  Math.abs(resolved.y - Math.min(sy()(2000), sy()(4000))) < 1,
  `resolved brush y matches field b range (${resolved.y})`,
);

console.log('brush-render: all assertions passed');
