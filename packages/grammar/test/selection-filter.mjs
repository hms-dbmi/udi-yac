/**
 * A chart's click or brush, applied as a named filter to the charts linked to it.
 *
 * Run with: node test/selection-filter.mjs   (after pnpm build:toolkit)
 *
 * A click stores the picked values as text (`String(datum[field])`), while the
 * table holds what Arquero parsed: a CSV's 2020 is the number 2020, so a
 * strict comparison against "2020" emptied every linked chart. And a tweak
 * that rebinds a chart from a number field to a category field keeps its
 * selection name, which must come back with the new type.
 */
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useDataSourcesStore } from '../dist/index.js';

setActivePinia(createPinia());
const aq = await import('arquero');
const store = useDataSourcesStore();

store.seedDataSource(
  'donors',
  'donors',
  aq.fromCSV(
    "year,flag,sex,donor's age\n2020,true,Female,30\n2021,false,Male,50\n2020,,Male,70",
  ),
);

const filtered = (name) =>
  store.getDataObject(['donors'], [{ filter: { name } }]).displayData;

// Numbers, booleans and nulls are picked as text and must still match.
for (const [field, picked, expected] of [
  ['year', ['2020'], 2],
  ['flag', ['true'], 1],
  ['flag', ['null'], 1],
  ['sex', ['Male'], 2],
]) {
  store.bindExternalDataSelections({
    pick: {
      dataSourceKey: 'donors',
      type: 'point',
      selection: { [field]: picked },
    },
  });
  assert.equal(filtered('pick').length, expected, `${field} = ${picked}`);
}

// A brush on a field whose name holds a quote.
store.bindExternalDataSelections({
  pick: {
    dataSourceKey: 'donors',
    type: 'interval',
    selection: { "donor's age": [40, 80] },
  },
});
assert.equal(
  filtered('pick').length,
  2,
  'a quoted field name must not break the brush',
);

// Rebinding the chart behind `chart-1` from a number to a category field.
store.watchDataSelection('donors', 'chart-1', 'interval');
store.updateDataSelection('chart-1', { year: [2019, 2020] });
store.watchDataSelection('donors', 'chart-1', 'point');
assert.equal(store.dataSelections['chart-1'].type, 'point');
assert.equal(
  store.dataSelections['chart-1'].selection,
  null,
  'the old range is dropped',
);
store.updateDataSelection('chart-1', { sex: ['Female'] });
assert.deepEqual(
  filtered('chart-1').map((d) => d.sex),
  ['Female'],
);

console.log('Selection-filter test passed ✓');
