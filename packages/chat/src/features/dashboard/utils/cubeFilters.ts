/**
 * Linked filtering over pre-aggregated data cubes.
 *
 * For a row-level source, applying a filter means prepending a predicate to
 * the visualization's transformation pipeline. For a **cube** that is wrong,
 * and provably so. A cube stores one row per dimension-subset combination,
 * so a visualization reads its data by *marginal selection*: the rows where
 * exactly its own dimensions are populated and every other dimension is
 * null. A per-sex chart therefore reads rows in which `race` IS NULL by
 * construction — prepending `race IN ('White')` yields the empty set, since
 * the two predicates contradict. No ordering of the conjuncts fixes it: the
 * correct operation is to read a *different marginal* and re-aggregate.
 *
 * That operation is **expand → filter → contract**:
 *
 *   expand    read the `V ∪ F` marginal instead of `V`, where V is the
 *             visualization's own dimensions and F the filtered ones
 *   filter    apply the selections, which now touch populated columns
 *   contract  group by V and re-aggregate the measure, returning data in
 *             exactly the shape the visualization already expects
 *
 * It degenerates correctly: with no filters there is nothing to expand or
 * contract; when every filtered dimension is already one of the
 * visualization's own (F ⊆ V) the expand and contract steps are the
 * identity and a plain prepended filter is right after all.
 *
 * Contraction is exact only for measures that survive re-aggregation (sums,
 * counts, min/max). Filters that a cube cannot serve at all — a field that
 * isn't one of its dimensions, a cross-source join a pre-aggregated table
 * has no keys for, a non-contractible measure — are reported back as
 * skipped rather than silently producing wrong numbers.
 */

import type { DataTransformation, UDIGrammar } from 'udi-toolkit';
import type { ContractOp } from '@/features/data-package';
import type { CubeInfo } from '@/types/dataPackage';

// Minimal shapes the spec-walking code relies on. The canonical UDIGrammar
// tree is a discriminated union of mark-specific layer types; these model
// only the fields read here without losing type safety.
interface SpecMappingLike {
  field?: string;
}

interface SpecRepresentationLike {
  mapping?: SpecMappingLike | SpecMappingLike[];
}

/** Why a filter could not be applied to a particular cube visualization. */
export type SkipReason =
  /** The filtered field is not one of the cube's dimensions. */
  | 'non-dimension'
  /** The selection originates in another entity; a cube has no line-level
   *  keys to join on. */
  | 'cross-source'
  /** The measure cannot be re-aggregated across the contracted dimension. */
  | 'non-additive-measure'
  /** The spec references no cube measure, so there is nothing to contract. */
  | 'no-measure'
  /** The spec has no recognisable marginal selector to expand. */
  | 'no-marginal';

export interface SkippedFilter {
  id: string;
  fields: string[];
  reason: SkipReason;
}

/** One active selection, reduced to what the cube rewrite needs. */
export interface ActiveFilter {
  /** Selection name, as referenced by `{ filter: { name } }`. */
  id: string;
  /** The entity the selection was made on. */
  sourceName: string;
  /** The fields it constrains. */
  fields: string[];
}

export interface BuildCubeTransformationArgs {
  /** The visualization's own (non-interactive) spec. */
  spec: UDIGrammar;
  /** The cube backing the spec's source. */
  cube: CubeInfo;
  /** The entity the spec reads. */
  sourceName: string;
  /** Every active selection that could apply to this visualization. */
  filters: ActiveFilter[];
  /** How a measure re-aggregates on contract; null if it cannot. */
  measureOp: (measure: string) => ContractOp | null;
  /** Null-value filters the dashboard appends, already built. */
  nullFilters: DataTransformation[];
}

export interface CubeTransformationResult {
  transformation: DataTransformation[];
  /** Filters that could not be applied to this visualization. */
  skipped: SkippedFilter[];
}

/**
 * Every field named by a visual encoding. The visualization's dimension set
 * V is derived from this, and the dashboard's null-value filters use the
 * same list — one definition, so the two can't drift.
 */
export function getRepresentedFields(spec: UDIGrammar): string[] {
  if (!spec.representation) return [];
  const fields = new Set<string>();
  const representations = Array.isArray(spec.representation)
    ? (spec.representation as SpecRepresentationLike[])
    : [spec.representation as SpecRepresentationLike];
  for (const representation of representations) {
    const rawMapping = representation.mapping;
    const mappings: SpecMappingLike[] = Array.isArray(rawMapping)
      ? rawMapping
      : rawMapping
        ? [rawMapping]
        : [];
    for (const mapping of mappings) {
      if (mapping && 'field' in mapping && mapping.field) {
        fields.add(mapping.field);
      }
    }
  }
  return Array.from(fields);
}

/**
 * Every field the spec names anywhere — encodings, aggregate `field`s,
 * expression leaves, `groupby`, `orderby`.
 *
 * Which measures need contracting can't be read off the representation
 * alone: a normalized stacked bar maps only a derived `proportion`, while
 * the cube measure it is computed from appears solely inside the pipeline's
 * rollups. Contracting only the represented measure would leave those
 * downstream rollups reading a column that no longer exists.
 */
export function collectFieldReferences(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectFieldReferences(item, into);
    return into;
  }
  if (value == null || typeof value !== 'object') return into;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'field' || key === 'groupby' || key === 'only') {
      if (typeof child === 'string') into.add(child);
      else if (Array.isArray(child)) {
        for (const item of child) if (typeof item === 'string') into.add(item);
      }
    }
    collectFieldReferences(child, into);
  }
  return into;
}

/** Flatten an `&&`-chained expression into its leaves. */
function flattenConjunction(expr: unknown, into: unknown[] = []): unknown[] {
  const node = expr as { op?: string; left?: unknown; right?: unknown } | null;
  if (node && node.op === '&&') {
    flattenConjunction(node.left, into);
    flattenConjunction(node.right, into);
    return into;
  }
  into.push(expr);
  return into;
}

/**
 * The dimensions a marginal selector marks as populated, or null if the
 * transform isn't one.
 *
 * Recognises both spellings: the `only` operator, and the expanded
 * null-comparison conjunction the agent's `<MARGINAL:…>` placeholder emits
 * (`d != null && other == null && …`).
 */
export function marginalDimensions(
  transform: DataTransformation,
  dimensions: string[],
): string[] | null {
  if ('only' in transform && transform.only != null) {
    const active = Array.isArray(transform.only) ? transform.only : [transform.only];
    return active.every((d) => dimensions.includes(d)) ? active : null;
  }
  if (!('filter' in transform) || transform.filter == null) return null;
  const leaves = flattenConjunction(transform.filter);
  const active: string[] = [];
  for (const leaf of leaves) {
    const node = leaf as {
      op?: string;
      left?: { field?: string };
      right?: { literal?: unknown };
    } | null;
    if (!node || (node.op !== '==' && node.op !== '!=')) return null;
    const field = node.left?.field;
    if (typeof field !== 'string' || !dimensions.includes(field)) return null;
    if (!node.right || !('literal' in node.right) || node.right.literal !== null) return null;
    if (node.op === '!=') active.push(field);
  }
  return active;
}

/** Index of the spec's marginal selector, or -1 if it has none. */
function findMarginalIndex(transformation: DataTransformation[], dimensions: string[]): number {
  return transformation.findIndex((t) => marginalDimensions(t, dimensions) !== null);
}

/** Order a dimension set the way the cube declares them, for stable specs. */
function inCubeOrder(fields: Iterable<string>, dimensions: string[]): string[] {
  const wanted = new Set(fields);
  return dimensions.filter((d) => wanted.has(d));
}

/** `{ filter: { name } }` steps for a set of selections. */
function namedFilters(list: ActiveFilter[]): DataTransformation[] {
  return list.map((f) => ({ filter: { name: f.id } }) as DataTransformation);
}

/**
 * Split candidate filters into those a cube can serve at all and those it
 * cannot. Independent of what the visualization looks like, so both the
 * chart pipeline and the entity-count pipeline apply the same rules.
 */
function partitionFilters(
  filters: ActiveFilter[],
  cube: CubeInfo,
  sourceName: string,
): { applicable: ActiveFilter[]; skipped: SkippedFilter[] } {
  const applicable: ActiveFilter[] = [];
  const skipped: SkippedFilter[] = [];
  for (const filter of filters) {
    if (filter.sourceName !== sourceName) {
      // A cube row is an aggregate, not an entity — there is no key column to
      // join another entity's selection against.
      skipped.push({ id: filter.id, fields: filter.fields, reason: 'cross-source' });
      continue;
    }
    const foreign = filter.fields.filter((f) => !cube.dimensions.includes(f));
    if (foreign.length > 0) {
      skipped.push({ id: filter.id, fields: foreign, reason: 'non-dimension' });
      continue;
    }
    applicable.push(filter);
  }
  return { applicable, skipped };
}

/**
 * Rewrite a cube visualization's transformation pipeline so the given
 * filters apply. Returns the pipeline plus any filters the cube can't serve.
 *
 * Callers pass every candidate filter; partitioning them into applicable and
 * skipped is this function's job, since only it knows the cube's dimensions
 * and the measures the spec depends on.
 */
export function buildCubeTransformation({
  spec,
  cube,
  sourceName,
  filters,
  measureOp,
  nullFilters,
}: BuildCubeTransformationArgs): CubeTransformationResult {
  const baseTransformation = (spec.transformation ?? []) as DataTransformation[];
  const { applicable, skipped } = partitionFilters(filters, cube, sourceName);

  // The unexpanded composition: filters first, then the spec's own pipeline.
  // Correct whenever no expansion is needed — the marginal the spec reads
  // already has every filtered dimension populated.
  const withoutExpansion = (list: ActiveFilter[]): DataTransformation[] => [
    ...namedFilters(list),
    ...baseTransformation,
    ...nullFilters,
  ];

  const represented = getRepresentedFields(spec);
  const marginalIndex = findMarginalIndex(baseTransformation, cube.dimensions);
  const declaredMarginal =
    marginalIndex >= 0
      ? (marginalDimensions(baseTransformation[marginalIndex], cube.dimensions) ?? [])
      : [];

  // V — the marginal this visualization reads. Driven by the represented
  // fields, unioned with whatever the spec's own selector declares so a
  // dimension the spec depends on but doesn't encode is never dropped.
  const vizDimensions = inCubeOrder(
    [...represented.filter((f) => cube.dimensions.includes(f)), ...declaredMarginal],
    cube.dimensions,
  );

  const filterDimensions = new Set<string>();
  for (const filter of applicable) {
    for (const field of filter.fields) filterDimensions.add(field);
  }

  const needsExpansion = [...filterDimensions].some((d) => !vizDimensions.includes(d));
  if (!needsExpansion) return { transformation: withoutExpansion(applicable), skipped };

  if (marginalIndex < 0) {
    // A cube spec with no recognisable marginal selector: we don't know which
    // step to replace, so rewriting it would be guesswork. Leave the pipeline
    // alone and apply only the filters that need no expansion.
    return partiallyApply(applicable, vizDimensions, skipped, withoutExpansion, 'no-marginal');
  }

  // Measures the pipeline depends on — these must survive contraction with
  // their column names intact, or downstream steps break.
  const referenced = collectFieldReferences(spec);
  const measures = cube.measures.filter((m) => referenced.has(m));
  if (measures.length === 0) {
    return partiallyApply(applicable, vizDimensions, skipped, withoutExpansion, 'no-measure');
  }

  const ops = new Map<string, ContractOp>();
  for (const measure of measures) {
    const op = measureOp(measure);
    // Averaging averages, or taking a median of medians, produces a number
    // that looks right and isn't. Refuse rather than render it.
    if (op === null) {
      return partiallyApply(
        applicable,
        vizDimensions,
        skipped,
        withoutExpansion,
        'non-additive-measure',
      );
    }
    ops.set(measure, op);
  }

  const expandedDimensions = inCubeOrder([...vizDimensions, ...filterDimensions], cube.dimensions);
  const rollup = Object.fromEntries(measures.map((m) => [m, { op: ops.get(m)!, field: m }]));

  return {
    skipped,
    transformation: [
      // expand — replaces the spec's own marginal selector in place
      { only: expandedDimensions } as DataTransformation,
      // filter — the selections now touch populated columns
      ...namedFilters(applicable),
      // contract — back to the shape the rest of the pipeline expects.
      // No groupby for a grand-total view: the rollup alone yields one row.
      ...(vizDimensions.length > 0 ? [{ groupby: vizDimensions } as DataTransformation] : []),
      { rollup } as DataTransformation,
      ...baseTransformation.slice(marginalIndex + 1),
      ...nullFilters,
    ],
  };
}

export interface BuildCubeCountArgs {
  cube: CubeInfo;
  sourceName: string;
  filters: ActiveFilter[];
  measureOp: (measure: string) => ContractOp | null;
  /** Output column name for the contracted measure. */
  as: string;
}

/**
 * The filtered total for a whole cube entity — the same expand → filter →
 * contract pipeline with V = ∅, so it contracts to a single row.
 *
 * The row-level equivalent (`[...filters, { rollup: { count } }]`) counts
 * table rows, which for a cube means counting pre-aggregated cells: a number
 * that answers no question anyone asked. The grand total lives in the
 * all-null marginal instead.
 */
export function buildCubeCountTransformation({
  cube,
  sourceName,
  filters,
  measureOp,
  as,
}: BuildCubeCountArgs): CubeTransformationResult {
  const { applicable, skipped } = partitionFilters(filters, cube, sourceName);

  // Any contractible measure gives the same total; take the first.
  const measure = cube.measures.find((m) => measureOp(m) !== null);
  if (!measure) {
    // Nothing can be re-aggregated, so no filter can apply — but the
    // UNfiltered total is still readable: the all-null marginal is a single
    // row, and rolling one row up is the identity whatever the measure means.
    const fallback = cube.measures[0];
    return {
      transformation: fallback
        ? ([
            { only: [] },
            { rollup: { [as]: { op: 'sum', field: fallback } } },
          ] as DataTransformation[])
        : [{ only: [] } as DataTransformation],
      skipped: [
        ...skipped,
        ...applicable.map((f) => ({
          id: f.id,
          fields: f.fields,
          reason: 'non-additive-measure' as const,
        })),
      ],
    };
  }

  const expandedDimensions = inCubeOrder(
    applicable.flatMap((f) => f.fields),
    cube.dimensions,
  );
  return {
    skipped,
    transformation: [
      { only: expandedDimensions } as DataTransformation,
      ...namedFilters(applicable),
      { rollup: { [as]: { op: measureOp(measure)!, field: measure } } } as DataTransformation,
    ],
  };
}

/**
 * Fall back to the unexpanded pipeline, keeping only the filters that need
 * no expansion and reporting the rest as skipped.
 */
function partiallyApply(
  applicable: ActiveFilter[],
  vizDimensions: string[],
  skipped: SkippedFilter[],
  withoutExpansion: (list: ActiveFilter[]) => DataTransformation[],
  reason: SkipReason,
): CubeTransformationResult {
  const keep: ActiveFilter[] = [];
  const drop: SkippedFilter[] = [];
  for (const filter of applicable) {
    const outside = filter.fields.filter((f) => !vizDimensions.includes(f));
    if (outside.length > 0) drop.push({ id: filter.id, fields: outside, reason });
    else keep.push(filter);
  }
  return { transformation: withoutExpansion(keep), skipped: [...skipped, ...drop] };
}
