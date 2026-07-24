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

type OrderbyEntry = string | { field?: string; [key: string]: unknown };

interface TransformationLike {
  groupby?: string | string[];
  binby?: { field?: string; [key: string]: unknown };
  rollup?: Record<string, { op?: string; field?: string; [key: string]: unknown }>;
  kde?: { field?: string; [key: string]: unknown };
  join?: { on?: string | (string | string[])[]; [key: string]: unknown };
  orderby?: OrderbyEntry | OrderbyEntry[];
  // filter / derive are intentionally absent from the *locking* logic — they
  // are schema-preserving or free-form and do not "lock" a mapping field.
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
 * Collect the set of source-field names referenced by an operator we cannot
 * swap in-place. A mapping whose `field` belongs to this set is not offered as
 * a plain field swap — rewriting only the mapping would leave the pipeline
 * pointing at the old field, producing a silently-broken chart.
 *
 * Locked operators — no supported swap:
 *   binby     `.field` becomes bin input; output replaces the row schema
 *   kde       `.field` is the density-estimation input
 *   join      `.on` fields define the join key
 *
 * NOT locked (swappable via a transform-aware mutation instead):
 *   groupby   swappable via swapDimensionField — rewrites the groupby entry
 *             (and dependent rollup output columns) alongside the mapping
 *   rollup    each aggregation's `.field` is swappable via swapMeasureField —
 *             the mapping references the rollup *output* column, not the input
 *
 * Skipped (schema-preserving / free-form):
 *   filter    row-count-only effect, schema unchanged
 *   orderby   sort only; schema unchanged
 *   derive    only creates new output fields
 */
export function collectLockedFields(spec: UDIGrammar): Set<string> {
  const locked = new Set<string>();
  const transformation = (spec as { transformation?: TransformationLike[] }).transformation;
  if (!Array.isArray(transformation)) return locked;

  for (const t of transformation) {
    if (t == null || typeof t !== 'object') continue;

    // binby: { field, ... }
    if (t.binby?.field) locked.add(t.binby.field);

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

/** The group-by dimension field names referenced anywhere in the pipeline. */
export function collectGroupbyFields(spec: UDIGrammar): Set<string> {
  const fields = new Set<string>();
  const transformation = (spec as { transformation?: TransformationLike[] }).transformation;
  if (!Array.isArray(transformation)) return fields;
  for (const t of transformation) {
    if (t?.groupby == null) continue;
    if (typeof t.groupby === 'string') fields.add(t.groupby);
    else if (Array.isArray(t.groupby)) for (const f of t.groupby) fields.add(f);
  }
  return fields;
}

export interface RollupOutput {
  op?: string;
  field?: string;
}

/**
 * Map each rollup *output column name* to its aggregation. Encoding mappings
 * reference these output names (e.g. `sex_count`, `avg_age`), not the raw
 * input field — so this is how the tweak UI recognises an aggregated measure
 * and decides whether it has a swappable input `field` (count/frequency don't).
 * Last write wins if two rollups reuse a name (grammar disallows this anyway).
 */
export function collectRollupOutputs(spec: UDIGrammar): Record<string, RollupOutput> {
  const outputs: Record<string, RollupOutput> = {};
  const transformation = (spec as { transformation?: TransformationLike[] }).transformation;
  if (!Array.isArray(transformation)) return outputs;
  for (const t of transformation) {
    if (t?.rollup == null || typeof t.rollup !== 'object') continue;
    for (const [key, agg] of Object.entries(t.rollup)) {
      outputs[key] = { op: agg?.op, field: agg?.field };
    }
  }
  return outputs;
}

/**
 * Replace `oldTok` with `newTok` when it appears as a whole `_`-delimited
 * token of `name`, so `sex_count` → `race_count` and `avg_age` → `avg_weight`,
 * but `sexuality` is left alone.
 *
 * ponytail: token-boundary only. camelCase or otherwise-embedded field names
 * aren't rewritten — the derived column just keeps a slightly stale label; the
 * chart is still correct. Upgrade to a smarter tokenizer only if real specs
 * name their aggregation outputs that way.
 */
function renameToken(name: string, oldTok: string, newTok: string): string {
  if (name === oldTok) return newTok;
  const parts = name.split('_');
  if (!parts.includes(oldTok)) return name;
  return parts.map((p) => (p === oldTok ? newTok : p)).join('_');
}

interface RenamePlan {
  /** column-name → new-name; applied to mapping.field, orderby refs, rollup output keys. */
  columnRenames: Map<string, string>;
  /** rename a group-by dimension entry. */
  groupbyRename?: { from: string; to: string };
  /** set the input `.field` of the rollup that produces `outputKey`. */
  rollupFieldRename?: { outputKey: string; to: string };
}

function renameOrderby(
  orderby: unknown,
  renames: Map<string, string>,
): { value: unknown; changed: boolean } {
  let changed = false;
  const one = (o: unknown): unknown => {
    if (typeof o === 'string') {
      if (renames.has(o)) {
        changed = true;
        return renames.get(o);
      }
      return o;
    }
    if (o != null && typeof o === 'object' && 'field' in o) {
      const f = (o as { field?: string }).field;
      if (f != null && renames.has(f)) {
        changed = true;
        return { ...o, field: renames.get(f) };
      }
    }
    return o;
  };
  if (Array.isArray(orderby)) return { value: orderby.map(one), changed };
  return { value: one(orderby), changed };
}

/**
 * Apply a rename plan across the transformation pipeline (groupby entries,
 * rollup output keys + input fields, orderby refs) and the representation
 * mappings, in a single structured pass. Returns the same object reference
 * when nothing changed (callers compare by reference to detect no-ops).
 */
function applyRenamePlan(spec: UDIGrammar, plan: RenamePlan): UDIGrammar {
  const { columnRenames, groupbyRename, rollupFieldRename } = plan;
  let changed = false;

  const transformation = (spec as { transformation?: TransformationLike[] }).transformation;
  const nextTransformation = Array.isArray(transformation)
    ? transformation.map((t): TransformationLike => {
        if (t == null || typeof t !== 'object') return t;
        let next = t;

        if (groupbyRename && next.groupby != null) {
          const { from, to } = groupbyRename;
          if (typeof next.groupby === 'string') {
            if (next.groupby === from) {
              changed = true;
              next = { ...next, groupby: to };
            }
          } else if (Array.isArray(next.groupby) && next.groupby.includes(from)) {
            changed = true;
            next = { ...next, groupby: next.groupby.map((f) => (f === from ? to : f)) };
          }
        }

        if (next.rollup != null && typeof next.rollup === 'object') {
          let rollupChanged = false;
          const nextRollup: Record<string, unknown> = {};
          for (const [key, agg] of Object.entries(next.rollup)) {
            const newKey = columnRenames.get(key) ?? key;
            let newAgg: unknown = agg;
            if (rollupFieldRename && rollupFieldRename.outputKey === key) {
              newAgg = { ...(agg as object), field: rollupFieldRename.to };
              rollupChanged = true;
            }
            if (newKey !== key) rollupChanged = true;
            nextRollup[newKey] = newAgg;
          }
          if (rollupChanged) {
            changed = true;
            next = { ...next, rollup: nextRollup as TransformationLike['rollup'] };
          }
        }

        if (next.orderby != null) {
          const { value, changed: obChanged } = renameOrderby(next.orderby, columnRenames);
          if (obChanged) {
            changed = true;
            next = { ...next, orderby: value as TransformationLike['orderby'] };
          }
        }

        return next;
      })
    : transformation;

  // representation: rewrite mapping.field via columnRenames
  const updateMapping = (m: MappingLike): MappingLike => {
    if (m?.field != null && columnRenames.has(m.field)) {
      changed = true;
      return { ...m, field: columnRenames.get(m.field) };
    }
    return m;
  };
  const updateLayer = (layer: RepresentationLike): RepresentationLike => {
    if (layer == null || typeof layer !== 'object' || layer.mapping == null) return layer;
    if (Array.isArray(layer.mapping))
      return { ...layer, mapping: layer.mapping.map(updateMapping) };
    return { ...layer, mapping: updateMapping(layer.mapping) };
  };
  const rep = spec.representation as RepresentationLike | RepresentationLike[] | undefined;
  const nextRepresentation =
    rep == null ? rep : Array.isArray(rep) ? rep.map(updateLayer) : updateLayer(rep);

  if (!changed) return spec;
  return {
    ...spec,
    ...(Array.isArray(transformation) ? { transformation: nextTransformation } : {}),
    ...(rep == null ? {} : { representation: nextRepresentation }),
  } as UDIGrammar;
}

/** The field currently bound to `encoding` (first match across layers). */
function fieldForEncoding(spec: UDIGrammar, encoding: string): string | undefined {
  const rep = spec.representation as RepresentationLike | RepresentationLike[] | undefined;
  if (rep == null) return undefined;
  const layers = Array.isArray(rep) ? rep : [rep];
  for (const layer of layers) {
    if (layer?.mapping == null) continue;
    const mappings = Array.isArray(layer.mapping) ? layer.mapping : [layer.mapping];
    for (const m of mappings) if (m?.encoding === encoding) return m.field;
  }
  return undefined;
}

/** True if any representation mapping is bound to `field`. */
function specReferencesField(spec: UDIGrammar, field: string): boolean {
  const rep = spec.representation as RepresentationLike | RepresentationLike[] | undefined;
  if (rep == null) return false;
  const layers = Array.isArray(rep) ? rep : [rep];
  for (const layer of layers) {
    if (layer?.mapping == null) continue;
    const mappings = Array.isArray(layer.mapping) ? layer.mapping : [layer.mapping];
    if (mappings.some((m) => m?.field === field)) return true;
  }
  return false;
}

/** Add `newField` to every groupby step that already groups by `anchorField`. */
function addGroupbyField(spec: UDIGrammar, anchorField: string, newField: string): UDIGrammar {
  const transformation = (spec as { transformation?: TransformationLike[] }).transformation;
  if (!Array.isArray(transformation)) return spec;
  let changed = false;
  const next = transformation.map((t): TransformationLike => {
    if (t == null || typeof t !== 'object' || t.groupby == null) return t;
    const arr = typeof t.groupby === 'string' ? [t.groupby] : t.groupby;
    if (!arr.includes(anchorField) || arr.includes(newField)) return t;
    changed = true;
    return { ...t, groupby: [...arr, newField] };
  });
  if (!changed) return spec;
  return { ...spec, transformation: next } as UDIGrammar;
}

/**
 * Swap the group-by dimension shown on ONE encoding (e.g. the x axis, sex →
 * race), keeping the aggregation. The mapping rewrite is scoped to `encoding`,
 * so a field shared by another encoding (a bar with `x=sex` AND `color=sex`) is
 * not disturbed.
 *
 * The groupby is kept consistent with what the chart displays:
 *   - if the old field is no longer shown anywhere, it is replaced by `newField`
 *     in the groupby, and any rollup output column embedding it (`sex_count`) is
 *     renamed (`race_count`) so labels track the swap;
 *   - if the old field is still shown on another encoding, `newField` is instead
 *     added to the groupby (the chart now groups by both) and nothing else is
 *     renamed.
 *
 * Returns the same reference on a no-op (encoding absent, or already newField).
 */
export function swapDimensionField(
  spec: UDIGrammar,
  encoding: string,
  newField: string,
): UDIGrammar {
  const oldField = fieldForEncoding(spec, encoding);
  if (oldField == null || oldField === newField) return spec;

  // 1. Rewrite only the edited encoding's mapping.
  const afterMapping = setMappingFieldByEncoding(spec, encoding, newField);
  if (afterMapping === spec) return spec;

  // 2. Old field still shown elsewhere → group by both, rename nothing else.
  if (specReferencesField(afterMapping, oldField)) {
    return addGroupbyField(afterMapping, oldField, newField);
  }

  // 3. Old field fully replaced → rename it in the groupby/orderby, plus any
  //    rollup output column that embeds it so labels stay accurate.
  const columnRenames = new Map<string, string>([[oldField, newField]]);
  for (const key of Object.keys(collectRollupOutputs(afterMapping))) {
    const renamed = renameToken(key, oldField, newField);
    if (renamed !== key) columnRenames.set(key, renamed);
  }
  return applyRenamePlan(afterMapping, {
    columnRenames,
    groupbyRename: { from: oldField, to: newField },
  });
}

/**
 * Swap the input field of an aggregated measure (e.g. mean of age → mean of
 * weight). `outputKey` is the rollup output column the encoding is bound to.
 * Renames that rollup's `.field`, renames the output column if it embeds the
 * old field name (`avg_age` → `avg_weight`), and updates the encoding / orderby
 * refs that pointed at it. Leaves the group-by dimension untouched.
 */
export function swapMeasureField(
  spec: UDIGrammar,
  outputKey: string,
  newField: string,
): UDIGrammar {
  const oldField = collectRollupOutputs(spec)[outputKey]?.field;
  if (!oldField || oldField === newField) return spec;
  const newKey = renameToken(outputKey, oldField, newField);
  const columnRenames = new Map<string, string>();
  if (newKey !== outputKey) columnRenames.set(outputKey, newKey);
  return applyRenamePlan(spec, { columnRenames, rollupFieldRename: { outputKey, to: newField } });
}
