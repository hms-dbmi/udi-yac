/**
 * Filters carried across linked columns: a cube dimension and the line-level
 * column it was aggregated from.
 *
 * A cube row is a count, not a subject, so a cube shares no key with the
 * line-level tables and a filter cannot reach across by joining. What the two
 * do share is the column itself: the cube's `initial_treatment_order` holds
 * the same values as Treatment Summary's. A data package declares that with
 * `udi:linked_dimensions` on the cube, and linked columns form a group.
 *
 * A selection on any column of a group is **mirrored** onto every other
 * column of the group, as a selection on that column's own table. Everything
 * downstream then works unchanged: a cube chart sees a filter on one of its
 * own dimensions, which the expand → filter → contract rewrite serves, and a
 * line-level table sees a filter it reaches the other line-level tables from
 * through their foreign keys.
 *
 * Mirrors are keyed by (target column, source column), never by the selection
 * they came from, and are always present — null when nothing is selected. The
 * toolkit's store only ever merges selections bound into it, so a mirror that
 * stopped being sent would stay in force after its filter was cleared.
 *
 * ponytail: values carry across verbatim, so a link is only right between
 * columns that spell their values the same way. Columns that differ (a
 * cube's `subtype` against the line-level diagnosis) need a declared value map.
 */

import type { LinkedColumn } from '@/types/dataPackage';
import type { DataSelection, DataSelections } from '../stores/dataFiltersStore';

/** Prefix of every mirrored selection's key. */
export const LINKED_SELECTION_PREFIX = 'link:';

const columnKey = (c: LinkedColumn) => `${c.entity}.${c.field}`;

/** The key of the selection mirrored from `source` onto `target`. */
export function linkedSelectionKey(target: LinkedColumn, source: LinkedColumn): string {
  return `${LINKED_SELECTION_PREFIX}${columnKey(target)}<-${columnKey(source)}`;
}

/** Whether a selection key is a mirror rather than a filter someone set. */
export function isLinkedSelectionKey(key: string): boolean {
  return key.startsWith(LINKED_SELECTION_PREFIX);
}

type Constraint =
  | { type: 'point'; values: unknown[] }
  | { type: 'interval'; range: [number | null, number | null] };

/** Every non-empty constraint the selections put on one column. */
function constraintsOn(selections: DataSelections, column: LinkedColumn): Constraint[] {
  const out: Constraint[] = [];
  for (const [key, s] of Object.entries(selections)) {
    if (isLinkedSelectionKey(key)) continue;
    if (s?.dataSourceKey !== column.entity || !s.selection) continue;
    const value = (s.selection as Record<string, unknown>)[column.field];
    if (!Array.isArray(value)) continue;
    if (s.type === 'point') {
      // An empty value list constrains nothing (as the toolkit reads it).
      if (value.length > 0) out.push({ type: 'point', values: value });
    } else {
      const [min, max] = value as [number | null, number | null];
      if (min != null || max != null) out.push({ type: 'interval', range: [min, max] });
    }
  }
  return out;
}

/**
 * One selection holding every constraint on a column, or null for none.
 *
 * Several filters on the same column (a chat filter and a host's) all apply,
 * so they intersect. A point and an interval constraint can't be written as
 * one selection; the point one wins, being the narrower in practice.
 */
function combine(
  constraints: Constraint[],
): { type: DataSelection['type']; value: unknown[] } | null {
  const points = constraints.filter((c) => c.type === 'point');
  if (points.length > 0) {
    let values = points[0].values.map(String);
    for (const p of points.slice(1)) {
      const keep = new Set(p.values.map(String));
      values = values.filter((v) => keep.has(v));
    }
    return { type: 'point', value: values };
  }
  const intervals = constraints.filter((c) => c.type === 'interval');
  if (intervals.length === 0) return null;
  let [lo, hi] = intervals[0].range;
  for (const { range } of intervals.slice(1)) {
    if (range[0] != null) lo = lo == null ? range[0] : Math.max(lo, range[0]);
    if (range[1] != null) hi = hi == null ? range[1] : Math.min(hi, range[1]);
  }
  return { type: 'interval', value: [lo, hi] };
}

/**
 * The mirrored selections for a set of selections: one per ordered pair of
 * columns in each link group, null when the source column is unfiltered.
 */
export function linkedSelections(
  selections: DataSelections,
  groups: LinkedColumn[][],
): DataSelections {
  const out: DataSelections = {};
  for (const group of groups) {
    for (const source of group) {
      const combined = combine(constraintsOn(selections, source));
      for (const target of group) {
        if (target === source) continue;
        // Re-keyed to the target's own column name.
        const selection = combined
          ? ({ [target.field]: combined.value } as DataSelection['selection'])
          : null;
        out[linkedSelectionKey(target, source)] = {
          type: combined?.type ?? 'point',
          dataSourceKey: target.entity,
          selection,
        } as DataSelection;
      }
    }
  }
  return out;
}

/** The selections plus their mirrors, as the toolkit should see them. */
export function withLinkedSelections(
  selections: DataSelections,
  groups: LinkedColumn[][],
): DataSelections {
  if (groups.length === 0) return selections;
  return { ...selections, ...linkedSelections(selections, groups) };
}

/**
 * Column (`entity.field`) → every table a filter on it reaches through links,
 * the column's own table excluded. Lets the cube rewrite tell a filter it
 * cannot serve from one a mirror already serves.
 */
export function linkedEntitiesByColumn(groups: LinkedColumn[][]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const group of groups) {
    for (const column of group) {
      out.set(
        columnKey(column),
        group.filter((c) => c.entity !== column.entity).map((c) => c.entity),
      );
    }
  }
  return out;
}
