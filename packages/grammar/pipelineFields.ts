import type { DataTransformation, UDIGrammar } from './GrammarTypes';

/**
 * Static column-flow analysis over a spec's transformation pipeline: which
 * field names still exist in the table the representation renders from.
 *
 * A mapping, null-filter or brush that names a field the pipeline has
 * aggregated away is not a harmless no-op — it's a hard error. Arquero throws
 * `Invalid column reference: "d['x']"`, and the server-side compiler emits SQL
 * the database rejects (`Column 'x' cannot be resolved`). Callers that inject
 * field references into a spec they didn't author (interactivity, null
 * filters) use this to drop the references that can't resolve.
 *
 * Mirrors the Arquero executor (`PerformDataTransformations` in
 * DataSourcesStore.ts) — deliberately the stricter of the two engines. After
 * `binby`, Arquero's bin columns exist only in `rollup`/`kde` output, while
 * the SQL compiler materializes them immediately (`SELECT *, <expr> AS
 * start`); modelling the strict side means a field reported present resolves
 * in both.
 *
 * Returns `null` when the pipeline can't be analyzed statically — unknown
 * source columns, an unrecognized transform, a reference to a table that
 * isn't in the environment. That means "no information", not "no fields":
 * callers should fall back to their un-narrowed behavior.
 */
export function pipelineOutputFields(
  spec: Pick<UDIGrammar, 'source' | 'transformation'>,
  sourceFields: Record<string, readonly string[]> | null | undefined,
): Set<string> | null {
  if (!sourceFields) return null;

  const sources = Array.isArray(spec.source)
    ? spec.source
    : spec.source
      ? [spec.source]
      : [];
  const first = sources[0];
  if (!first) return null;

  // The executor seeds its named-table environment with every source, then
  // writes each transform's result back into it (see `setOutTable`).
  const env = new Map<string, TableShape>();
  for (const source of sources) {
    const fields = sourceFields[source.name];
    if (!fields) return null; // a participating table with unknown columns
    env.set(source.name, { columns: new Set(fields), groups: [] });
  }

  let currentKey = first.name;
  let current = env.get(currentKey) ?? null;
  if (!current) return null;

  for (const transform of spec.transformation ?? []) {
    const next = applyTransform(transform, current, env);
    if (!next) return null;
    current = next;
    // Mirrors `setOutTable`: an explicit `out` renames the current table, a
    // scalar `in` overwrites the table it read from, and a join without `out`
    // leaves the current name alone.
    if (transform.out) {
      currentKey = transform.out;
    } else if (transform.in && !Array.isArray(transform.in)) {
      currentKey = transform.in;
    }
    env.set(currentKey, current);
  }

  return current.columns;
}

/** The shape of one table mid-pipeline. */
interface TableShape {
  columns: Set<string>;
  /** Active `groupby`/`binby` keys — the only pre-aggregation columns that
   *  survive a `rollup` or `kde`. Bin keys live here and *not* in `columns`
   *  because that is where Arquero keeps them (`groupby({start: expr})`
   *  materializes the column in aggregate output only). */
  groups: string[];
}

/** Arquero suffixes collide-ing non-key columns on join; the executor's
 *  multi-key path joins on this derived column. */
const JOIN_SUFFIXES = ['_1', '_2'] as const;
const MULTI_KEY_JOIN_COLUMN = 'udi_internal_multi_key_join';

function shapeOf(
  inName: string | undefined,
  current: TableShape,
  env: Map<string, TableShape>,
): TableShape | null {
  if (!inName) return current;
  return env.get(inName) ?? null;
}

function carry(shape: TableShape): TableShape {
  return { columns: new Set(shape.columns), groups: [...shape.groups] };
}

function applyTransform(
  transform: DataTransformation,
  current: TableShape,
  env: Map<string, TableShape>,
): TableShape | null {
  if ('join' in transform) {
    return joinShape(transform, env);
  }

  const inName = Array.isArray(transform.in) ? undefined : transform.in;
  const input = shapeOf(inName, current, env);
  if (!input) return null;

  // filter / orderby leave both columns and grouping untouched.
  if ('filter' in transform || 'orderby' in transform) {
    return carry(input);
  }

  if ('groupby' in transform) {
    const { groupby } = transform;
    return {
      columns: new Set(input.columns),
      groups: Array.isArray(groupby) ? [...groupby] : [groupby],
    };
  }

  if ('binby' in transform) {
    const { bin_start = 'start', bin_end = 'end' } =
      transform.binby.output ?? {};
    return { columns: new Set(input.columns), groups: [bin_start, bin_end] };
  }

  if ('rollup' in transform) {
    // Aggregation is the narrowing step: group keys plus the named outputs,
    // and nothing else.
    return {
      columns: new Set([...input.groups, ...Object.keys(transform.rollup)]),
      groups: [],
    };
  }

  if ('kde' in transform) {
    const { sample = 'sample', density = 'density' } =
      transform.kde.output ?? {};
    return {
      columns: new Set([...input.groups, sample, density]),
      groups: [],
    };
  }

  if ('derive' in transform) {
    return {
      columns: new Set([...input.columns, ...Object.keys(transform.derive)]),
      groups: [...input.groups],
    };
  }

  return null; // unrecognized transform: analysis is no longer sound
}

function joinShape(
  transform: Extract<DataTransformation, { join: unknown }>,
  env: Map<string, TableShape>,
): TableShape | null {
  const [leftKey, rightKey] = transform.in;
  const left = env.get(leftKey);
  const right = env.get(rightKey);
  if (!left || !right) return null;

  // Keys matched to a same-named column appear once in Arquero's output; every
  // other name present on both sides is suffixed (`x` -> `x_1`, `x_2`).
  const { on } = transform.join;
  const sharedKeys = new Set<string>();
  if (typeof on === 'string') {
    sharedKeys.add(on);
  } else if (on.every((key): key is string => typeof key === 'string')) {
    // An all-strings `on` reaches Arquero verbatim, which reads it as a list
    // of columns present under the same name in both tables.
    for (const key of on) sharedKeys.add(key);
  } else {
    // Multi-key: the executor derives a composite key on each side and joins
    // on that, leaving the original key columns to collide like any other.
    sharedKeys.add(MULTI_KEY_JOIN_COLUMN);
  }

  const columns = new Set<string>();
  for (const [index, side] of [left, right].entries()) {
    const other = index === 0 ? right : left;
    for (const name of side.columns) {
      if (!other.columns.has(name) || sharedKeys.has(name)) {
        columns.add(name);
      } else {
        columns.add(`${name}${JOIN_SUFFIXES[index]}`);
      }
    }
  }
  if (sharedKeys.has(MULTI_KEY_JOIN_COLUMN)) {
    columns.add(MULTI_KEY_JOIN_COLUMN);
  }
  // Arquero's join returns an ungrouped table.
  return { columns, groups: [] };
}
