import type { UDIGrammar } from 'udi-toolkit/react';

interface MappingLike {
  field?: string;
  encoding?: string;
  type?: string;
  [key: string]: unknown;
}

interface RepresentationLike {
  mark?: string;
  mapping?: MappingLike | MappingLike[];
  [key: string]: unknown;
}

interface TransformationLike {
  groupby?: string | string[];
  binby?: { field?: string; [key: string]: unknown };
  rollup?: Record<string, { field?: string; [key: string]: unknown }>;
  kde?: { field?: string; [key: string]: unknown };
  join?: { on?: string | (string | string[])[]; [key: string]: unknown };
  // filter / orderby / derive are intentionally absent — they are schema-
  // preserving or free-form and do not "lock" a mapping field.
  [key: string]: unknown;
}

/**
 * Return a new spec with every mapping whose `encoding` matches `encoding`
 * rewritten to use `newField`. All other parts of the spec — including
 * mappings on different encodings, transformation pipelines, source.name,
 * and named filters — are left untouched.
 *
 * Replaces the historical string-replace approach (`JSON.stringify(spec)
 * .replace(/"oldField"/g, '"newField"')`), which had three problems:
 *   1. It updated EVERY occurrence of the string, so two encodings bound to
 *      the same field (e.g. a density plot with both axes on `age_value`)
 *      would change together when only one was meant to.
 *   2. It silently rewrote transformations and source references that
 *      happened to mention the field by name.
 *   3. The regex was unescaped — field names containing `.` (e.g.
 *      `donor.hubmap_id`) matched arbitrary characters, causing collisions.
 *
 * If `encoding` is not present in any layer's mapping, returns the original
 * spec object unchanged so callers can compare by reference to detect no-ops.
 */
export function setMappingFieldByEncoding(
  spec: UDIGrammar,
  encoding: string,
  newField: string,
): UDIGrammar {
  if (!spec.representation) return spec;
  let didChange = false;

  const updateLayer = (layer: RepresentationLike): RepresentationLike => {
    if (layer == null || typeof layer !== 'object') return layer;
    const mapping = layer.mapping;
    if (mapping == null) return layer;

    const updateMapping = (m: MappingLike): MappingLike => {
      if (m?.encoding === encoding && m.field !== newField) {
        didChange = true;
        return { ...m, field: newField };
      }
      return m;
    };

    if (Array.isArray(mapping)) {
      const nextMappings = mapping.map(updateMapping);
      return { ...layer, mapping: nextMappings };
    }
    return { ...layer, mapping: updateMapping(mapping) };
  };

  const nextRepresentation = Array.isArray(spec.representation)
    ? (spec.representation as RepresentationLike[]).map(updateLayer)
    : updateLayer(spec.representation as RepresentationLike);

  if (!didChange) return spec;
  return { ...spec, representation: nextRepresentation } as UDIGrammar;
}

/**
 * Collect the set of source-field names that are referenced by any
 * schema-defining operator in `spec.transformation`. A mapping whose
 * `field` belongs to this set should not be offered as tweakable — swapping
 * it via VizTweak would leave the transformation pipeline referencing the
 * old field while the mapping points at a new field that the pipeline's
 * output no longer contains, producing a silently-broken chart.
 *
 * Schema-defining operators — covered here:
 *   groupby   row keys of the output
 *   binby     `.field` becomes bin input; output replaces the row schema
 *   rollup    each aggregation's `.field` is an input to the op; when a
 *             mapping references that same field elsewhere, orphaning it
 *             breaks the rollup
 *   kde       `.field` is the density-estimation input
 *   join      `.on` fields define the join key
 *
 * Schema-preserving / free-form operators — skipped intentionally:
 *   filter    string expression; row-count-only effect, schema unchanged
 *   orderby   sort only; schema unchanged
 *   derive    only creates new output fields; expressions are opaque strings
 *             (would need a parser to extract source-field references safely)
 */
export function collectLockedFields(spec: UDIGrammar): Set<string> {
  const locked = new Set<string>();
  const transformation = (spec as { transformation?: TransformationLike[] }).transformation;
  if (!Array.isArray(transformation)) return locked;

  for (const t of transformation) {
    if (t == null || typeof t !== 'object') continue;

    // groupby: string | string[]
    if (t.groupby != null) {
      if (typeof t.groupby === 'string') locked.add(t.groupby);
      else if (Array.isArray(t.groupby)) for (const f of t.groupby) locked.add(f);
    }

    // binby: { field, ... }
    if (t.binby?.field) locked.add(t.binby.field);

    // rollup: { [outputName]: { op, field? } }
    if (t.rollup != null && typeof t.rollup === 'object') {
      for (const agg of Object.values(t.rollup)) {
        if (agg?.field) locked.add(agg.field);
      }
    }

    // kde: { field, ... }
    if (t.kde?.field) locked.add(t.kde.field);

    // join.on: string | [string, string] | [string[], string[]]
    const on = t.join?.on;
    if (typeof on === 'string') {
      locked.add(on);
    } else if (Array.isArray(on)) {
      for (const entry of on) {
        if (typeof entry === 'string') locked.add(entry);
        else if (Array.isArray(entry)) for (const f of entry) locked.add(f);
      }
    }
  }

  return locked;
}
