import type { RowMapping } from 'udi-toolkit';
import type { ExampleGroup } from './types';

// Live HuBMAP portal metadata. The portal's CORS policy admits the published
// site but not localhost, so dev reads the copy committed in sample-data/hubmap.
const portal = import.meta.env.DEV
  ? './data/hubmap'
  : 'https://portal.hubmapconsortium.org/metadata/v0/udi';
export const links = {
  donors: `${portal}/donors.tsv`,
  datasets: `${portal}/datasets.tsv`,
  samples: `${portal}/samples.tsv`,
};

function getTextMapping(field: string): RowMapping[] {
  return [
    {
      field,
      encoding: 'text',
      mark: 'text',
      type: 'quantitative',
    },
  ];
}

function getColorCategoryMapping(field: string): RowMapping[] {
  return [
    {
      field,
      encoding: 'color',
      mark: 'rect',
      type: 'nominal',
    },
    {
      field,
      encoding: 'text',
      mark: 'text',
      type: 'quantitative',
    },
  ];
}

function getColorBarMapping(field: string): RowMapping[] {
  return [
    {
      field,
      encoding: 'x',
      mark: 'bar',
      type: 'quantitative',
    },
    {
      field,
      encoding: 'text',
      mark: 'text',
      type: 'quantitative',
    },
    {
      field,
      encoding: 'color',
      mark: 'bar',
      type: 'quantitative',
    },
  ];
}

export const hubmapExampleGroups: ExampleGroup[] = [
  {
    name: 'Datasets',
    description: 'The following section explores metadata from HuBMAP datasets.',
    examples: [
      {
        name: 'Datasets by Organ',
        spec: {
          source: { name: 'datasets', source: links.datasets },
          transformation: [
            { derive: { organ: `d.origin_samples_unique_mapped_organs` } },
            { groupby: ['organ'] },
            { rollup: { count: { op: 'count' } } },
            { orderby: { field: 'organ', order: 'desc' } },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'organ', type: 'nominal' },
              { encoding: 'y', field: 'count', type: 'quantitative' },
            ],
          },
        },
      },
      {
        name: 'Datasets by Assay and Organ',
        spec: {
          source: { name: 'datasets', source: links.datasets },
          transformation: [
            { derive: { organ: `d.origin_samples_unique_mapped_organs` } },
            {
              groupby: ['organ', 'assay_category'],
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
              { encoding: 'x', field: 'count', type: 'quantitative' },
              { encoding: 'y', field: 'organ', type: 'nominal' },
              { encoding: 'color', field: 'assay_category', type: 'nominal' },
            ],
          },
        },
      },
      {
        name: 'Datasets Heatmap by Organ and Assay',
        spec: {
          source: { name: 'datasets', source: links.datasets },
          transformation: [
            { derive: { organ: `d.origin_samples_unique_mapped_organs` } },
            {
              groupby: ['organ', 'assay_category'],
            },
            {
              rollup: {
                count: { op: 'count' },
              },
            },
          ],
          representation: [
            {
              mark: 'rect',
              mapping: [
                {
                  encoding: 'color',
                  field: 'count',
                  type: 'quantitative',
                  range: ['#eafab9', '#528aeb'],
                },
                { encoding: 'x', field: 'organ', type: 'nominal' },
                { encoding: 'y', field: 'assay_category', type: 'nominal' },
              ],
            },
            {
              mark: 'text',
              mapping: [
                { encoding: 'text', field: 'count', type: 'quantitative' },
                { encoding: 'x', field: 'organ', type: 'nominal' },
                { encoding: 'y', field: 'assay_category', type: 'nominal' },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    name: 'Donors',
    description: 'The following section explores metadata from HuBMAP donors.',
    examples: [
      {
        name: 'Table',
        description:
          'This is a plain table of raw metadata for every available donor, with no transformations applied. All that is provided is the source.',
        spec: {
          source: { name: 'donors', source: links.donors },
        },
      },
      {
        name: 'Visual Table',
        description: 'This is a table that visualizes the available donor metadata.',
        spec: {
          source: { name: 'donors', source: links.donors },
          representation: {
            mark: 'row',
            mapping: [
              ...getTextMapping('hubmap_id'),
              ...getColorCategoryMapping('sex'),
              ...getColorCategoryMapping('abo_blood_group_system'),
              ...getColorBarMapping('age_value'),
              ...getTextMapping('age_unit'),
              ...getColorBarMapping('body_mass_index_value'),
              ...getTextMapping('body_mass_index_unit'),
              ...getColorBarMapping('weight_value'),
              ...getTextMapping('weight_unit'),
              ...getColorBarMapping('height_value'),
              ...getTextMapping('height_unit'),
              ...getColorCategoryMapping('group_name'),
              ...getColorCategoryMapping('race'),
            ],
          },
        },
      },
      {
        name: 'Donors by Sex',
        description:
          'This simple bar chart visualization uses the above metadata to compare the number of available donors of each sex via a rollup operation.',
        spec: {
          source: { name: 'donors', source: links.donors },
          transformation: [{ groupby: 'sex' }, { rollup: { count: { op: 'count' } } }],
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
        name: 'Donors by Race and Sex',
        description:
          'This is a slightly more complex stacked bar chart showing the number of available donors of each race, with each bar divided to show the ratio of sexes within that group.',
        spec: {
          source: { name: 'donors', source: links.donors },
          transformation: [{ groupby: ['sex', 'race'] }, { rollup: { count: { op: 'count' } } }],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'race', type: 'nominal' },
              { encoding: 'y', field: 'count', type: 'quantitative' },
              { encoding: 'color', field: 'sex', type: 'nominal' },
            ],
          },
        },
      },
      {
        name: 'Donors by Age Group and Sex',
        spec: {
          source: { name: 'donors', source: links.donors },
          transformation: [
            {
              derive: {
                age_group: `
                  d.age_value === undefined || d.age_value === "" ?
                    "Unknown" :
                    (Math.floor(+d.age_value / 10) * 10) + "s"
                `,
              },
            },
            { groupby: ['sex', 'age_group'] },
            { rollup: { count: { op: 'count' } } },
          ],
          representation: {
            mark: 'bar',
            mapping: [
              { encoding: 'x', field: 'age_group', type: 'nominal' },
              { encoding: 'y', field: 'count', type: 'quantitative' },
              { encoding: 'color', field: 'sex', type: 'nominal' },
            ],
          },
        },
      },
    ],
  },
  {
    name: 'Samples',
    description: 'The following section explores metadata from HuBMAP samples.',
    examples: [
      {
        name: 'Samples by Organ',
        spec: {
          source: { name: 'samples', source: links.samples },
          transformation: [
            {
              derive: { organ: `d.origin_samples_unique_mapped_organs` },
            },
            { groupby: ['organ'] },
            { rollup: { count: { op: 'count' } } },
            { orderby: { field: 'organ', order: 'desc' } },
          ],
          representation: [
            {
              mark: 'row',
              mapping: [
                { mark: 'text', encoding: 'text', field: 'organ', type: 'nominal' },
                { mark: 'text', encoding: 'text', field: 'count', type: 'quantitative' },
              ],
            },
          ],
        },
      },
    ],
  },
];
