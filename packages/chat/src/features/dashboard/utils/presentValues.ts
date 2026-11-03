import type { DataTransformation, UDIGrammar } from 'udi-toolkit';
import type { QueryDataSpec } from 'udi-toolkit/react';
import type { ContractOp } from '@/features/data-package';
import type { CubeInfo } from '@/types/dataPackage';
import type { DataSelections } from '../stores/dataFiltersStore';
import { buildCubeTransformation, type ActiveFilter } from './cubeFilters';
import { LINKED_SELECTION_PREFIX } from './linkedSelections';

/**
 * The values a category filter offers, narrowed to those the OTHER filters
 * leave: filter to one diagnosis and the protocol filter lists that
 * diagnosis's protocols, not all two hundred.
 *
 * A column never narrows itself — ticking one value would hide the rest — so
 * every filter on the edited columns is left out, together with the mirrors
 * cube links make of them or onto them.
 */

/** The one table a query reads. */
type TableSource = { name: string; source: string };

/** `entity.field`, the form mirror keys spell columns in. */
const columnKey = (entity: string, field: string) => `${entity}.${field}`;

/**
 * The filter ids that may narrow the edited filter's values: all of
 * `filterIds` except the edited filter, any other filter on one of its
 * columns, and any mirror from or onto one of them.
 */
export function otherFilterIds(
  filterIds: string[],
  selections: DataSelections,
  editedKey: string,
  entity: string,
  fields: string[],
): string[] {
  const edited = new Set(fields.map((f) => columnKey(entity, f)));
  return filterIds.filter((id) => {
    if (id === editedKey) return false;
    if (id.startsWith(LINKED_SELECTION_PREFIX)) {
      // `link:<target><-<source>`
      const [target, source] = id.slice(LINKED_SELECTION_PREFIX.length).split('<-');
      return !edited.has(target) && !edited.has(source);
    }
    const s = selections[id];
    if (!s?.selection || s.dataSourceKey !== entity) return true;
    return !Object.keys(s.selection).some((f) => edited.has(columnKey(entity, f)));
  });
}

/**
 * A line-level table's query: the other filters, then one row per value of
 * `field`. Null when no filter reaches the table, since the answer would be
 * the whole domain.
 */
export function presentValuesSpec(
  source: TableSource,
  field: string,
  namedFilters: DataTransformation[],
): QueryDataSpec | null {
  if (namedFilters.length === 0) return null;
  return {
    source,
    transformation: [
      ...namedFilters,
      { groupby: [field] },
      { rollup: { n: { op: 'count' } } },
    ] as DataTransformation[],
  };
}

/**
 * A cube's query, through the pipeline its charts use: a chart of `field`
 * against one measure, expanded to the marginal the filters need, filtered,
 * and contracted back by `field`. A value is present where the measure is
 * above zero. Null when the cube has no measure that re-aggregates, or no
 * filter applies to it — a filter the charts skip doesn't narrow either.
 */
export function presentCubeValuesSpec(
  source: TableSource,
  field: string,
  cube: CubeInfo,
  filters: ActiveFilter[],
  measureOp: (measure: string) => ContractOp | null,
): { spec: QueryDataSpec; measure: string } | null {
  const measure = cube.measures.find((m) => measureOp(m) !== null);
  if (!measure || !cube.dimensions.includes(field)) return null;
  const chart = {
    source,
    transformation: [{ only: [field] }],
    representation: {
      mark: 'bar',
      mapping: [
        { encoding: 'x', field, type: 'nominal' },
        { encoding: 'y', field: measure, type: 'quantitative' },
      ],
    },
  } as unknown as UDIGrammar;
  const { transformation } = buildCubeTransformation({
    spec: chart,
    cube,
    sourceName: source.name,
    filters,
    measureOp,
    nullFilters: [],
  });
  const applied = transformation.some((t) => 'filter' in t);
  return applied ? { spec: { source, transformation }, measure } : null;
}
