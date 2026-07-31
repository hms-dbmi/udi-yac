// Unit test for describeTransformations. Run after `npm run build:all`
// (imports from dist).
import assert from 'node:assert/strict';
import { describeTransformations } from '../dist/index.js';

assert.deepEqual(describeTransformations({}), [], 'no transformation → []');

assert.deepEqual(
  describeTransformations({
    transformation: [{ groupby: 'sex' }, { rollup: { sex_count: { op: 'count' } } }],
  }),
  ['Group by sex', 'Aggregate: count → sex_count'],
  'count-by-dimension',
);

assert.deepEqual(
  describeTransformations({
    transformation: [
      { groupby: ['organ', 'sex'] },
      { rollup: { avg_age: { op: 'mean', field: 'age' } } },
      { orderby: { field: 'avg_age', order: 'desc' } },
    ],
  }),
  ['Group by organ, sex', 'Aggregate: mean of age → avg_age', 'Sort by avg_age (desc)'],
  'measure + multi-group + sort',
);

assert.deepEqual(
  describeTransformations({
    transformation: [{ binby: { field: 'age', bins: 10 } }, { filter: 'd.age > 5' }],
  }),
  ['Bin age into 10 bins', 'Filter: d.age > 5'],
  'binby + legacy string filter',
);

assert.deepEqual(
  describeTransformations({
    transformation: [{ filter: { op: '!=', left: { field: 'mass' }, right: { literal: null } } }],
  }),
  ['Filter rows'],
  'structured Expr filter → generic label',
);

console.log('describe-transformations: all assertions passed');
