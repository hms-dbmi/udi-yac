// Stories for the `unnest` transformation, which expands a delimited
// multi-value column into one row per value.
//
// HuBMAP's `social_history` is a real example of the shape: a donor's cell holds
// "Smoker, Heavy drinker", meaning the donor belongs to both categories. Grouping
// such a column directly counts *combinations*, so the stories below are a
// before/after pair on the same data — the difference is one transformation.

import UDIVis from './UDIVis.vue';

export default {
  component: UDIVis,
  tags: ['autodocs'],
  title: 'Unnest',
};

const DONORS = { name: 'donors', source: './data/donors.csv' };

/** Count donors per category, as a horizontal bar chart. */
const countByCategory = (field: string, transformation: object[]) => ({
  source: DONORS,
  transformation: [
    ...transformation,
    { filter: { op: '!=', left: { field }, right: { literal: null } } },
    { groupby: field },
    { rollup: { donors: { op: 'count' } } },
    { orderby: { field: 'donors', order: 'desc' } },
  ],
  representation: {
    mark: 'bar',
    mapping: [
      { encoding: 'y', field, type: 'nominal' },
      { encoding: 'x', field: 'donors', type: 'quantitative' },
    ],
  },
});

/**
 * Without `unnest`, every distinct *string* becomes its own category. "Smoker"
 * and "Smoker, Heavy drinker" are counted as unrelated groups, so this chart
 * reports 26 smokers when 45 donors smoke, and spends 19 bars on 12 real
 * categories. The more habits a donor records, the further the count drifts.
 */
export const WithoutUnnest = {
  args: { spec: countByCategory('social_history', []) },
};

/**
 * The same chart with one transformation added first. Each donor now contributes
 * a row per habit, so the bars are the 12 actual categories and "Smoker" counts
 * every donor who smokes.
 *
 * Note the counts sum to 96 across 67 donors: the cohorts overlap by design, and
 * the bars are no longer parts of a whole. `separator: ','` matches this column's
 * delimiter; surrounding whitespace is always trimmed, so `"a, b"` and `"a,b"`
 * behave the same.
 */
export const WithUnnest = {
  args: {
    spec: countByCategory('social_history', [
      { unnest: { field: 'social_history', separator: ',' } },
    ]),
  },
};

/**
 * What `unnest` does to the rows, shown directly. `out` writes each value into a
 * new column instead of overwriting the original, so both are visible: one donor
 * appears once per habit, with the whole original string repeated alongside.
 *
 * Rows whose cell is empty belong to no category and are dropped — 67 of the 266
 * donors record a social history, and only those are here.
 */
export const OneRowPerValue = {
  args: {
    spec: {
      source: DONORS,
      transformation: [
        { unnest: { field: 'social_history', separator: ',', out: 'habit' } },
        { orderby: 'hubmap_id' },
      ],
      representation: {
        mark: 'row',
        mapping: [
          {
            mark: 'text',
            encoding: 'text',
            field: 'hubmap_id',
            type: 'nominal',
          },
          {
            column: 'habit',
            mark: 'text',
            encoding: 'text',
            field: 'habit',
            type: 'nominal',
          },
          {
            column: 'social_history (original)',
            mark: 'text',
            encoding: 'text',
            field: 'social_history',
            type: 'nominal',
          },
        ],
      },
    },
  },
};

/**
 * A messier column of the same shape: `medical_history` holds up to a dozen
 * conditions per donor. Unnested it resolves to 51 conditions, which is more
 * categories than a bar chart can label, so this one is a table ordered by
 * frequency — Hypertension leads with 39 donors.
 *
 * `unnest` is the only transformation that *increases* the row count, so it has
 * to come before anything that counts rows; running it after a rollup would
 * multiply already-collapsed rows.
 */
export const RankedByFrequency = {
  args: {
    spec: {
      source: DONORS,
      transformation: [
        { unnest: { field: 'medical_history', separator: ',' } },
        {
          filter: {
            op: '!=',
            left: { field: 'medical_history' },
            right: { literal: null },
          },
        },
        { groupby: 'medical_history' },
        { rollup: { donors: { op: 'count' } } },
        { orderby: { field: 'donors', order: 'desc' } },
      ],
      representation: {
        mark: 'row',
        mapping: [
          {
            mark: 'text',
            encoding: 'text',
            field: 'medical_history',
            type: 'nominal',
          },
          {
            column: 'donors',
            mark: 'bar',
            encoding: 'x',
            field: 'donors',
            type: 'quantitative',
          },
        ],
      },
    },
  },
};
