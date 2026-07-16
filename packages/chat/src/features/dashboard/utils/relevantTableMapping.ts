import type { UDIGrammar } from 'udi-toolkit/react';

interface MappingLike {
  encoding?: string;
  field?: string;
  type?: string;
}

interface RowMappingEntry {
  encoding: 'text';
  mark: 'text';
  field: string;
  type: 'quantitative' | 'ordinal' | 'nominal';
}

/**
 * Build the "relevant fields" row mapping for a visualization's table view:
 * the entity's key columns (primary/foreign/unique) followed by the fields
 * the chart maps — e.g. a donor height×weight scatterplot tables as
 * [uuid, hubmap_id, height, weight] instead of all 40+ columns.
 *
 * Key columns are omitted when the pipeline aggregates (rollup/kde): the
 * output rows are groups, not entities, so key columns don't exist there.
 *
 * Returns null when nothing useful can be derived (no represented fields) —
 * callers fall back to the all-fields default (`field: '*'`).
 */
export function buildRelevantRowMapping(
  spec: UDIGrammar,
  keyFields: string[],
): RowMappingEntry[] | null {
  const representations = Array.isArray(spec.representation)
    ? spec.representation
    : spec.representation
      ? [spec.representation]
      : [];

  // Field → type from the chart's mappings, first mapping wins.
  const representedTypes = new Map<string, string>();
  for (const layer of representations) {
    const rawMapping = (layer as { mapping?: MappingLike | MappingLike[] }).mapping;
    const mappings = Array.isArray(rawMapping) ? rawMapping : rawMapping ? [rawMapping] : [];
    for (const mapping of mappings) {
      if (!mapping.field || mapping.field === '*') continue;
      if (!representedTypes.has(mapping.field)) {
        representedTypes.set(mapping.field, mapping.type ?? 'nominal');
      }
    }
  }
  if (representedTypes.size === 0) return null;

  const aggregated = (spec.transformation ?? []).some((t) => 'rollup' in t || 'kde' in t);

  const ordered: string[] = [];
  if (!aggregated) {
    for (const key of keyFields) {
      if (!ordered.includes(key)) ordered.push(key);
    }
  }
  for (const field of representedTypes.keys()) {
    if (!ordered.includes(field)) ordered.push(field);
  }

  const toType = (field: string): RowMappingEntry['type'] => {
    const t = representedTypes.get(field);
    return t === 'quantitative' || t === 'ordinal' ? t : 'nominal';
  };

  return ordered.map((field) => ({
    encoding: 'text',
    mark: 'text',
    field,
    type: toType(field),
  }));
}
