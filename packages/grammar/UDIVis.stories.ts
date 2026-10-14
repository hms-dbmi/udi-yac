import UDIVis from './UDIVis.vue';
import { setTimeFormats } from './temporal';

// export const ActionsData = {
//   onPinTask: fn(),
//   onArchiveTask: fn(),
// }

export default {
  component: UDIVis,
  tags: ['autodocs'],
  title: 'Other',
  //👇 Our exports that end in "Data" are not stories.
  // excludeStories: /.*Data$/,
  // args: {
  //   ...ActionsData,
  // },
};

// export const Default = {
//   args: {
//     spec: {
//       source: {
//         name: 'penguins',
//         source: './data/penguins.csv',
//       },
//       representation: {
//         mark: 'point',
//         encoding: {
//           x: { field: 'bill_length_mm' },
//           y: { field: 'flipper_length_mm' },
//           color: { field: 'body_mass_g' },
//         },
//       },
//     },
//   },
// };

export const Default = {
  args: {
    spec: {
      source: {
        name: 'donors',
        source: './data/hubmap/donors.tsv',
      },
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'y', field: 'height_value', type: 'quantitative' },
          { encoding: 'x', field: 'weight_value', type: 'quantitative' },
        ],
      },
    },
  },
};

export const HideVegaLiteActions = {
  args: {
    spec: {
      config: { hideActions: true },
      source: {
        name: 'donors',
        source: './data/hubmap/donors.tsv',
      },
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'y', field: 'height_value', type: 'quantitative' },
          { encoding: 'x', field: 'weight_value', type: 'quantitative' },
        ],
      },
    },
  },
};

export const Heatmap = {
  args: {
    spec: {
      source: {
        name: 'datasets',
        source: './data/hubmap/datasets.tsv',
      },
      transformation: [
        {
          groupby: ['origin_samples_unique_mapped_organs', 'assay_category'],
        },
        {
          rollup: {
            count: { op: 'count' },
          },
        },
        // {
        //   orderby: 'organ_count',
        // },
      ],
      representation: {
        mark: 'rect',
        mapping: [
          { encoding: 'color', field: 'count', type: 'quantitative' },
          {
            encoding: 'y',
            field: 'origin_samples_unique_mapped_organs',
            type: 'nominal',
          },
          { encoding: 'x', field: 'assay_category', type: 'nominal' },
        ],
      },
    },
  },
};

//  {
//   type: 'columnar'
//   mark: 'table',
//   mapping: {
//     // text, color, bar,

//     // other data representations

//     // map, images,
//   }
//  }

// export const Template = {
//   args: {
//     spec: {
//       source: {
//         name: 'penguins',
//         source: './data/penguins.csv',
//       },
//       representation: {
//         type: 'GoGComponent',
//         mark: '',
//         encoding: {

//         }
//       }
//     }
//   }
// }

// export const Layering = {
//   args: {
//     spec: {
//       source: {
//         name: 'penguins',
//         source: './data/penguins.csv',
//       },
//       representation: [
//         {
//           type: 'GoGComponent',
//           mark: 'point',
//           encoding: {
//             x: { field: 'bill_length_mm' },
//             y: { field: 'flipper_length_mm' },
//           },
//         },
//         {
//           type: 'GoGComponent',
//           mark: 'circle',
//           encoding: {
//             x: { field: 'bill_length_mm' },
//             y: { field: 'flipper_length_mm' },
//             color: { field: 'sex' },
//           },
//         },
//       ],
//     },
//   },
// };

export const Layering = {
  args: {
    spec: {
      source: {
        name: 'donors',
        source: './data/hubmap/donors.tsv',
      },
      transformation: [
        {
          groupby: 'sex',
        },
        {
          rollup: {
            mean_mass: { op: 'mean', field: 'weight_value' },
          },
        },
      ],
      representation: [
        {
          mark: 'bar',
          mapping: [
            { encoding: 'y', field: 'sex', type: 'nominal' },
            { encoding: 'x', field: 'mean_mass', type: 'quantitative' },
          ],
        },
        {
          mark: 'text',
          mapping: [
            { encoding: 'y', field: 'sex', type: 'nominal' },
            { encoding: 'x', field: 'mean_mass', type: 'quantitative' },
            { encoding: 'text', field: 'mean_mass', type: 'quantitative' },
          ],
        },
      ],
    },
  },
};

export const OrganMap = {
  args: {
    spec: {
      source: {
        name: 'donors',
        source: './data/organs.json', // e.g. a geojson format
      },
      ///
      representation: {
        mark: 'geometry',
        mapping: [
          { field: 'count', encoding: 'text', type: 'quantitative' },
          { field: 'name', encoding: 'color', type: 'quantitative' },
        ],
      },
    },
  },
};

export const Checkboxes = {
  args: {
    spec: {
      source: {
        name: 'donors',
        source: './data/hubmap/donors.tsv',
      },
      representation: {
        mark: 'checkbox',
        mapping: [{ field: 'sex', encoding: 'text', type: 'nominal' }],
      },
    },
  },
};

// HuBMAP's `*_timestamp` columns hold epoch ms. Registering them as dates (what
// chat does from the data package's `udi:time_format`) makes axes, tooltips and
// table cells show dates; the specs themselves stay `quantitative`.
const hubmapDates = {
  beforeEach: () => {
    setTimeFormats({
      datasets: {
        created_timestamp: 'epoch_ms',
        published_timestamp: 'epoch_ms',
        last_modified_timestamp: 'epoch_ms',
      },
    });
    return () => setTimeFormats({});
  },
};

const datasets = { name: 'datasets', source: './data/hubmap/datasets.tsv' };

export const DateHistogram = {
  ...hubmapDates,
  args: {
    spec: {
      source: datasets,
      transformation: [
        { binby: { field: 'created_timestamp' } },
        { rollup: { count: { op: 'count' } } },
      ],
      representation: {
        mark: 'rect',
        mapping: [
          { encoding: 'x', field: 'start', type: 'quantitative' },
          { encoding: 'x2', field: 'end', type: 'quantitative' },
          { encoding: 'y', field: 'count', type: 'quantitative' },
        ],
      },
    },
  },
};

export const DateAggregate = {
  ...hubmapDates,
  args: {
    spec: {
      source: datasets,
      transformation: [
        { groupby: 'dataset_type' },
        {
          rollup: {
            first_published: { op: 'min', field: 'published_timestamp' },
            last_published: { op: 'max', field: 'published_timestamp' },
          },
        },
      ],
      representation: [
        {
          mark: 'point',
          mapping: [
            { encoding: 'x', field: 'first_published', type: 'quantitative' },
            { encoding: 'y', field: 'dataset_type', type: 'nominal' },
          ],
        },
        {
          mark: 'point',
          mapping: [
            { encoding: 'x', field: 'last_published', type: 'quantitative' },
            { encoding: 'y', field: 'dataset_type', type: 'nominal' },
          ],
        },
      ],
    },
  },
};

export const DateTable = {
  ...hubmapDates,
  args: {
    spec: {
      source: datasets,
      transformation: [
        { groupby: 'dataset_type' },
        {
          rollup: {
            datasets: { op: 'count' },
            newest: { op: 'max', field: 'created_timestamp' },
            typical: { op: 'median', field: 'created_timestamp' },
          },
        },
      ],
      representation: {
        mark: 'row',
        mapping: [
          { mark: 'text', encoding: 'text', field: '*', type: 'nominal' },
        ],
      },
    },
  },
};
