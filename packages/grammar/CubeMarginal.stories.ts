import UDIVis from './UDIVis.vue';

/**
 * Reading a pre-aggregated powerset cube. `penguins_cube` stores one row per
 * subset of {species, island, sex} — dimensions in the subset populated, the
 * rest null — so every chart over it must first select the marginal it wants.
 *
 * These stories pass `dimensions` inline because a story loads a bare CSV
 * rather than a data package; in an app `loadDataPackage` registers the
 * resource's `udi:dimensions` and `only` resolves the null complement itself.
 */
export default {
  component: UDIVis,
  tags: ['autodocs'],
  title: 'Data Cube',
};

const CUBE_SOURCE = [
  {
    name: 'penguin_counts',
    source: './data/penguins_cube/penguins_cube.csv',
  },
];

const CUBE_DIMENSIONS = ['species', 'island', 'sex'];

const countsBySpecies = {
  mark: 'bar',
  mapping: [
    { encoding: 'y', field: 'species', type: 'nominal' },
    { encoding: 'x', field: 'cnt', type: 'quantitative' },
  ],
};

/**
 * The plain species marginal: rows where `species` is populated and both
 * `island` and `sex` are null. Equivalent to the predicate
 * `species != null && island == null && sex == null`, without the spec
 * having to know that `island` and `sex` exist.
 */
export const SpeciesMarginal = {
  args: {
    spec: {
      source: CUBE_SOURCE,
      transformation: [{ only: ['species'], dimensions: CUBE_DIMENSIONS }],
      representation: countsBySpecies,
    },
  },
};

/**
 * The same chart, filtered to one island — via expand → filter → contract.
 *
 * Prepending `island == 'Biscoe'` to the story above would return nothing:
 * the species marginal has `island` null by construction, so the two
 * predicates contradict. Instead this expands to the species × island
 * marginal, filters there, and sums `cnt` back up to per-species totals.
 */
export const FilteredByIsland = {
  args: {
    spec: {
      source: CUBE_SOURCE,
      transformation: [
        { only: ['species', 'island'], dimensions: CUBE_DIMENSIONS },
        {
          filter: {
            op: '==',
            left: { field: 'island' },
            right: { literal: 'Biscoe' },
          },
        },
        { groupby: ['species'] },
        { rollup: { cnt: { op: 'sum', field: 'cnt' } } },
      ],
      representation: countsBySpecies,
    },
  },
};

/**
 * `only: []` selects the grand-total row — every dimension null. The
 * degenerate case of a marginal, and what a single-value or "total count"
 * view over a cube reads.
 */
export const GrandTotal = {
  args: {
    spec: {
      source: CUBE_SOURCE,
      transformation: [{ only: [], dimensions: CUBE_DIMENSIONS }],
      representation: {
        mark: 'text',
        mapping: [{ encoding: 'text', field: 'cnt', type: 'quantitative' }],
      },
    },
  },
};
