import UDIVis from './UDIVis.vue';

// Demonstrates the `fontScale` prop: one multiplier on every text size a chart
// or table draws, for reading a dashboard off a projector. 1 keeps Vega's and
// ag-grid's stock sizes. The fixed-scale stories give stable URLs to
// screenshot side by side; the slider on any of them scales it live.

export default {
  component: UDIVis,
  tags: ['autodocs'],
  title: 'Font Scale',
  argTypes: {
    fontScale: { control: { type: 'range', min: 1, max: 2, step: 0.25 } },
  },
};

// Axis labels and titles, a color legend and a chart title — every kind of
// text Vega draws from config.
const barSpec = {
  source: { name: 'datasets', source: './data/hubmap/datasets.tsv' },
  transformation: [
    { groupby: 'assay_category' },
    { rollup: { count: { op: 'count' } } },
  ],
  representation: {
    mark: 'bar',
    mapping: [
      { encoding: 'x', field: 'assay_category', type: 'nominal' },
      { encoding: 'y', field: 'count', type: 'quantitative' },
      { encoding: 'color', field: 'assay_category', type: 'nominal' },
    ],
  },
  title: 'Datasets by assay category',
};

/** Baseline: identical to a chart without the prop. */
export const BarDefault = {
  args: { spec: barSpec, fontScale: 1 },
};

export const Bar150 = {
  args: { spec: barSpec, fontScale: 1.5 },
};

export const Bar200 = {
  args: { spec: barSpec, fontScale: 2 },
};

/** Bigger labels take plot room; a brush must still land where it is dragged. */
export const Brush200 = {
  args: {
    spec: {
      source: { name: 'donors', source: './data/hubmap/donors.tsv' },
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'weight_value', type: 'quantitative' },
          { encoding: 'y', field: 'height_value', type: 'quantitative' },
        ],
        select: {
          name: 'font-scale-brush',
          how: { type: 'interval', on: 'xy' },
        },
      },
    },
    fontScale: 2,
  },
};

/** ag-grid text and row height scale together, so rows don't clip. */
export const Table150 = {
  args: {
    spec: {
      source: { name: 'penguins', source: './data/penguins.csv' },
      representation: {
        mark: 'row',
        mapping: [
          { encoding: 'text', field: '*', type: 'quantitative', mark: 'text' },
        ],
      },
    },
    fontScale: 1.5,
  },
};
