// Specs use page-relative ./data/ paths, resolved at render time (resolve.ts).
import type { ExampleGroup } from './types';

export const exampleGroups: ExampleGroup[] = [
  {
    name: 'Tabular Charts',
    examples: [
      {
        name: 'Basic Table',
        spec: {
          source: [
            {
              name: 'samples',
              source: './data/example_samples.csv',
            },
          ],
          representation: [
            {
              mark: 'row',
              mapping: [
                {
                  mark: 'text',
                  encoding: 'text',
                  field: '*',
                  type: 'nominal',
                },
              ],
            },
          ],
        },
      },

      {
        name: 'Visual Table',
        spec: {
          source: [
            {
              name: 'samples',
              source: './data/example_samples.csv',
            },
          ],
          representation: [
            {
              mark: 'row',
              mapping: [
                {
                  mark: 'rect',
                  encoding: 'color',
                  field: 'organ',
                  type: 'nominal',
                },
                {
                  mark: 'rect',
                  encoding: 'color',
                  field: 'organ_condition',
                  type: 'nominal',
                },
                {
                  mark: 'bar',
                  encoding: 'x',
                  field: 'weight',
                  type: 'quantitative',
                },
                {
                  mark: 'rect',
                  encoding: 'color',
                  field: 'sample_category',
                  type: 'nominal',
                },
                {
                  mark: 'text',
                  encoding: 'text',
                  field: '*',
                  type: 'nominal',
                },
              ],
            },
          ],
        },
      },
      {
        name: 'Multiple Fields → One Column',
        spec: {
          source: [
            {
              name: 'donors',
              source: './data/example_donors.csv',
            },
          ],
          transformation: [{ orderby: 'height' }],
          representation: [
            {
              mark: 'row',
              mapping: [
                {
                  column: 'Multiple Fields',
                  mark: 'line',
                  encoding: 'color',
                  field: 'sex',
                  type: 'nominal',
                },
                {
                  column: 'Multiple Fields',
                  mark: 'point',
                  encoding: 'x',
                  field: 'height',
                  type: 'quantitative',
                },
                {
                  column: 'Multiple Fields',
                  mark: 'point',
                  encoding: 'size',
                  field: 'weight',
                  type: 'quantitative',
                },
                {
                  column: 'height (circle position)',
                  mark: 'text',
                  encoding: 'text',
                  field: 'height',
                  type: 'nominal',
                },
                {
                  column: 'height (circle position)',
                  mark: 'text',
                  encoding: 'x',
                  field: 'height',
                  type: 'quantitative',
                },
                {
                  column: 'weight (circle size)',
                  mark: 'text',
                  encoding: 'text',
                  field: 'weight',
                  type: 'quantitative',
                },
                {
                  column: 'weight (circle size)',
                  mark: 'point',
                  encoding: 'size',
                  field: 'weight',
                  type: 'quantitative',
                },
                {
                  column: 'sex (circle size)',
                  mark: 'bar',
                  encoding: 'color',
                  field: 'sex',
                  type: 'nominal',
                },
                {
                  column: 'sex (circle size)',
                  mark: 'text',
                  encoding: 'text',
                  field: 'sex',
                  type: 'nominal',
                },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    name: 'Bar Charts',
    examples: [
      {
        name: 'Total Record Count',
        spec: {
          source: {
            name: 'donors',
            source: './data/example_donors.csv',
          },
          transformation: [
            {
              rollup: {
                count: { op: 'count' },
              },
            },
          ],
          representation: {
            mark: 'bar',
            mapping: { encoding: 'x', field: 'count', type: 'quantitative' },
          },
        },
      },
      {
        name: 'Count by Category',
        spec: {
          source: {
            name: 'donors',
            source: './data/example_donors.csv',
          },
          transformation: [
            {
              groupby: 'sex',
            },
            {
              rollup: {
                count: { op: 'count' },
              },
            },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'sex', type: 'nominal' },
              { encoding: 'y', field: 'count', type: 'quantitative' },
            ],
          },
        },
      },
      {
        name: 'Aggregate by Category',
        spec: {
          source: {
            name: 'donors',
            source: './data/example_donors.csv',
          },
          transformation: [
            {
              groupby: 'sex',
            },
            {
              rollup: {
                'average weight': { op: 'mean', field: 'weight' },
              },
            },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'sex', type: 'nominal' },
              { encoding: 'y', field: 'average weight', type: 'quantitative' },
            ],
          },
        },
      },
      {
        name: 'Combining Data Sources',
        spec: {
          source: [
            {
              name: 'donors',
              source: './data/example_donors.csv',
            },
            {
              name: 'samples',
              source: './data/example_samples.csv',
            },
          ],
          transformation: [
            {
              in: ['donors', 'samples'],
              join: {
                on: ['id', 'donor_id'],
              },
              out: 'donor_sample_combined',
            },
            {
              groupby: 'sex',
            },
            {
              rollup: {
                'sample count': { op: 'count' },
              },
            },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'sex', type: 'nominal' },
              { encoding: 'y', field: 'sample count', type: 'quantitative' },
            ],
          },
        },
      },
      {
        name: 'Single Stacked Bar Chart',
        spec: {
          source: {
            name: 'samples',
            source: './data/example_samples.csv',
          },
          transformation: [
            { groupby: 'organ' },
            {
              rollup: {
                count: { op: 'count' },
              },
            },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'count', type: 'quantitative' },
              { encoding: 'color', field: 'organ', type: 'nominal' },
            ],
          },
        },
      },
      {
        name: 'Single Stacked Bar Chart (relative)',
        spec: {
          source: {
            name: 'samples',
            source: './data/example_samples.csv',
          },
          transformation: [
            { groupby: 'organ' },
            {
              rollup: {
                frequency: { op: 'frequency' },
              },
            },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'frequency', type: 'quantitative' },
              { encoding: 'color', field: 'organ', type: 'nominal' },
            ],
          },
        },
      },
      {
        name: 'Multiple Stacked Bar Charts',
        spec: {
          source: {
            name: 'samples',
            source: './data/example_samples.csv',
          },
          transformation: [
            { groupby: ['organ', 'organ_condition'] },
            {
              rollup: {
                count: { op: 'count' },
              },
            },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'count', type: 'quantitative' },
              { encoding: 'y', field: 'organ', type: 'nominal' },
              { encoding: 'color', field: 'organ_condition', type: 'nominal' },
            ],
          },
        },
      },
      {
        name: 'Multiple Stacked Bar Charts (relative)',
        spec: {
          source: {
            name: 'samples',
            source: './data/example_samples.csv',
          },
          transformation: [
            {
              groupby: 'organ',
              out: 'groupCounts',
            },
            {
              rollup: {
                organ_count: { op: 'count' },
              },
            },
            {
              in: 'samples',
              groupby: ['organ', 'organ_condition'],
            },
            {
              rollup: {
                organ_and_condition_count: { op: 'count' },
              },
            },
            {
              in: ['samples', 'groupCounts'],
              join: { on: 'organ' },
              out: 'datasets',
            },
            {
              derive: {
                frequency: 'd.organ_and_condition_count / d.organ_count',
              },
            },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'frequency', type: 'quantitative' },
              { encoding: 'y', field: 'organ', type: 'nominal' },
              { encoding: 'color', field: 'organ_condition', type: 'nominal' },
            ],
          },
        },
      },
    ],
  },
  {
    name: 'Circular Charts',
    examples: [
      {
        name: 'Pie Chart',
        spec: {
          source: [
            {
              name: 'samples',
              source: './data/example_samples.csv',
            },
          ],
          transformation: [
            {
              groupby: 'organ',
            },
            {
              rollup: {
                frequency: {
                  op: 'frequency',
                },
              },
            },
          ],
          representation: [
            {
              mark: 'arc',
              mapping: [
                {
                  encoding: 'color',
                  field: 'organ',
                  type: 'nominal',
                },
                {
                  encoding: 'theta',
                  field: 'frequency',
                  type: 'quantitative',
                },
              ],
            },
          ],
        },
      },
      {
        name: 'Donut Chart',
        spec: {
          source: [
            {
              name: 'samples',
              source: './data/example_samples.csv',
            },
          ],
          transformation: [
            {
              groupby: 'organ',
            },
            {
              rollup: {
                frequency: {
                  op: 'frequency',
                },
              },
            },
          ],
          representation: [
            {
              mark: 'arc',
              mapping: [
                {
                  encoding: 'color',
                  field: 'organ',
                  type: 'nominal',
                },
                {
                  encoding: 'theta',
                  field: 'frequency',
                  type: 'quantitative',
                },
                {
                  encoding: 'radius2',
                  value: 60,
                },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    name: 'Scatterplots',
    examples: [
      {
        name: 'Basic Scatter Plot',
        spec: {
          source: {
            name: 'donors',
            source: './data/example_donors.csv',
          },
          representation: {
            mark: 'point',
            mapping: [
              { encoding: 'y', field: 'height', type: 'quantitative' },
              { encoding: 'x', field: 'weight', type: 'quantitative' },
            ],
          },
        },
      },
      {
        name: 'Scatter Plot with Categories',
        spec: {
          source: {
            name: 'donors',
            source: './data/example_donors.csv',
          },
          representation: {
            mark: 'point',
            mapping: [
              { encoding: 'y', field: 'height', type: 'quantitative' },
              { encoding: 'x', field: 'weight', type: 'quantitative' },
              { encoding: 'color', field: 'sex', type: 'nominal' },
              { encoding: 'shape', field: 'sex', type: 'nominal' },
            ],
          },
        },
      },
      {
        name: 'Bubble Plot',
        spec: {
          source: {
            name: 'donors',
            source: './data/example_donors.csv',
          },
          representation: {
            mark: 'point',
            mapping: [
              { encoding: 'y', field: 'height', type: 'quantitative' },
              { encoding: 'x', field: 'weight', type: 'quantitative' },
              { encoding: 'size', field: 'age', type: 'quantitative' },
            ],
          },
        },
      },
    ],
  },
  {
    name: 'Heatmaps',
    examples: [
      {
        name: 'Heatmap of Categories',
        spec: {
          source: {
            name: 'samples',
            source: './data/example_samples.csv',
          },
          transformation: [
            {
              groupby: ['organ', 'organ_condition'],
            },
            {
              rollup: {
                count: {
                  op: 'count',
                },
              },
            },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              {
                encoding: 'x',
                field: 'organ_condition',
                type: 'nominal',
              },
              {
                encoding: 'y',
                field: 'organ',
                type: 'nominal',
              },
              {
                encoding: 'color',
                field: 'count',
                type: 'quantitative',
              },
            ],
          },
        },
      },
    ],
  },
  {
    name: 'Distribution Plots',
    examples: [
      {
        name: 'Histogram',
        spec: {
          source: {
            name: 'penguins',
            source: './data/penguins.csv',
          },
          transformation: [
            {
              binby: {
                field: 'bill_length_mm',
                bins: 10,
                nice: true,
                output: {
                  bin_start: 'start',
                  bin_end: 'end',
                },
              },
            },
            {
              rollup: {
                count: {
                  op: 'count',
                },
              },
            },
          ],
          representation: {
            mark: 'rect',
            mapping: [
              {
                encoding: 'x',
                field: 'start',
                type: 'quantitative',
              },
              {
                encoding: 'x2',
                field: 'end',
                type: 'quantitative',
              },
              {
                encoding: 'y',
                field: 'count',
                type: 'quantitative',
              },
            ],
          },
        },
      },
      {
        name: 'KDE Density Plot',
        spec: {
          source: {
            name: 'penguins',
            source: './data/penguins.csv',
          },
          transformation: [
            {
              kde: {
                field: 'bill_length_mm',
                samples: 100,
                output: {
                  sample: 'bill_length_mm',
                  density: 'density',
                },
              },
            },
          ],
          representation: {
            mark: 'area',
            mapping: [
              {
                encoding: 'x',
                field: 'bill_length_mm',
                type: 'quantitative',
              },
              {
                encoding: 'y',
                field: 'density',
                type: 'quantitative',
              },
            ],
          },
        },
      },
      {
        name: 'KDE Density Plot (grouped)',
        spec: {
          source: {
            name: 'penguins',
            source: './data/penguins.csv',
          },
          transformation: [
            {
              groupby: 'species',
            },
            {
              kde: {
                field: 'bill_length_mm',
                samples: 100,
                output: {
                  sample: 'bill_length_mm',
                  density: 'density',
                },
              },
            },
          ],
          representation: [
            {
              mark: 'area',
              mapping: [
                {
                  encoding: 'x',
                  field: 'bill_length_mm',
                  type: 'quantitative',
                },
                {
                  encoding: 'y',
                  field: 'density',
                  type: 'quantitative',
                },
                {
                  encoding: 'color',
                  field: 'species',
                  type: 'nominal',
                },
                { encoding: 'opacity', value: 0.25 },
              ],
            },
            {
              mark: 'line',
              mapping: [
                {
                  encoding: 'x',
                  field: 'bill_length_mm',
                  type: 'quantitative',
                },
                {
                  encoding: 'y',
                  field: 'density',
                  type: 'quantitative',
                },
                {
                  encoding: 'color',
                  field: 'species',
                  type: 'nominal',
                },
              ],
            },
          ],
        },
      },
      {
        name: 'Empirical CDF',
        spec: {
          source: {
            name: 'penguins',
            source: './data/penguins.csv',
          },
          transformation: [
            {
              orderby: 'bill_length_mm',
            },
            {
              derive: { total: 'count()' },
            },
            {
              derive: {
                percentile: {
                  rolling: {
                    expression: 'count() / d.total',
                  },
                },
              },
            },
          ],
          representation: {
            mark: 'line',
            mapping: [
              {
                encoding: 'x',
                field: 'bill_length_mm',
                type: 'quantitative',
              },
              {
                encoding: 'y',
                field: 'percentile',
                type: 'quantitative',
              },
            ],
          },
        },
      },
      {
        name: 'Empirical CDF (grouped)',
        spec: {
          source: {
            name: 'penguins',
            source: './data/penguins.csv',
          },
          transformation: [
            {
              orderby: 'bill_length_mm',
            },
            {
              groupby: 'species',
            },
            {
              derive: {
                total: 'count()',
              },
            },
            {
              derive: {
                percentile: {
                  rolling: {
                    expression: 'count() / d.total',
                  },
                },
              },
            },
          ],
          representation: {
            mark: 'line',
            mapping: [
              {
                encoding: 'x',
                field: 'bill_length_mm',
                type: 'quantitative',
              },
              {
                encoding: 'y',
                field: 'percentile',
                type: 'quantitative',
              },
              { encoding: 'color', field: 'species', type: 'nominal' },
            ],
          },
        },
      },
    ],
  },
];
