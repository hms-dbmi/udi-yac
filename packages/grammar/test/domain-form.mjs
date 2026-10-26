/**
 * A `{min, max}` domain on a chart mark must reach vega-lite as an array.
 *
 * Run with: node test/domain-form.mjs   (after pnpm build:toolkit)
 *
 * `Domain`'s documented numeric form is `{min, max}`, but vega-lite reads an
 * object domain as a *data reference* (`{data, field}`) and dies at render time
 * with "Undefined data set name: undefined" — a silent footgun no template hit
 * until the survival curves needed a fixed 0..100 axis. The table renderer
 * consumes `{min, max}` itself, so row marks must keep the object form.
 */
import assert from 'node:assert/strict';
import { compile } from 'vega-lite';

// What UDIVis.vue produces for a chart mark with domain: {min: 0, max: 100}.
const withArrayDomain = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'udi_data' },
  layer: [
    {
      mark: { type: 'line', tooltip: true },
      encoding: {
        x: { field: 't', type: 'quantitative' },
        y: { field: 'p', type: 'quantitative', scale: { domain: [0, 100] } },
      },
    },
  ],
};

// The pre-fix output: the object passed straight through.
const withObjectDomain = structuredClone(withArrayDomain);
withObjectDomain.layer[0].encoding.y.scale = { domain: { min: 0, max: 100 } };

const { spec: okSpec } = compile(withArrayDomain);
const yScale = okSpec.scales.find((s) => s.name === 'y');
assert.deepEqual(yScale.domain, [0, 100], 'array domain should survive as a literal domain');
assert.ok(
  (okSpec.data ?? []).some((d) => d.name === 'udi_data'),
  'the named dataset the runtime feeds rows into must exist',
);

// The object form compiles to a data reference with no dataset — exactly the
// shape that throws at render time.
const { spec: badSpec } = compile(withObjectDomain);
const badY = badSpec.scales.find((s) => s.name === 'y');
assert.ok(
  badY.domain && !Array.isArray(badY.domain) && badY.domain.data === undefined,
  `expected an undefined-dataset domain reference, got ${JSON.stringify(badY.domain)}`,
);

// One-sided domains map to domainMin/domainMax rather than an array.
const oneSided = structuredClone(withArrayDomain);
oneSided.layer[0].encoding.y.scale = { domainMin: 0 };
const { spec: oneSidedSpec } = compile(oneSided);
assert.ok(
  oneSidedSpec.scales.find((s) => s.name === 'y'),
  'domainMin should still produce a valid y scale',
);

console.log('domain-form: all assertions passed');
