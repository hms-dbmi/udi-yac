/**
 * Filters carried across linked columns: a cube dimension and the line-level
 * column it was aggregated from.
 *
 * A cube row is a count, not a subject, so a cube shares no key with the
 * line-level tables and a filter cannot reach across by joining. What the two
 * do share is the column itself: the cube's `initial_treatment_order` holds
 * the same values as Treatment Summary's. A data package declares that with
 * `udi:linked_dimensions` on the cube. Every cube dimension linked to the same
 * line-level column (the hub) forms a group with it.
 *
 * A selection on any column of a group is **mirrored** onto every other
 * column of the group, as a selection on that column's own table. Everything
 * downstream then works unchanged: a cube chart sees a filter on one of its
 * own dimensions, which the expand → filter → contract rewrite serves, and a
 * line-level table sees a filter it reaches the other line-level tables from
 * through their foreign keys.
 *
 * Columns that spell their values differently declare a value map (cube value
 * → the hub's values it stands for). Values translate through the hub, so two
 * cubes linked to one column translate between themselves too. A value with
 * no entry carries across as it is: an exact link needs no map, and a value
 * the other side lacks (a diagnosis no cube counts) then matches nothing there.
 *
 * Mirrors are keyed by (target column, source column), never by the selection
 * they came from, and are always present — null when nothing is selected. The
 * toolkit's store only ever merges selections bound into it, so a mirror that
 * stopped being sent would stay in force after its filter was cleared.
 */

import type { LinkedColumn, LinkGroup, LinkMember } from '@/types/dataPackage';
import type { DataSelection, DataSelections } from '../stores/dataFiltersStore';

/** Prefix of every mirrored selection's key. */
export const LINKED_SELECTION_PREFIX = 'link:';

const columnKey = (c: LinkedColumn) => `${c.entity}.${c.field}`;
const sameColumn = (a: LinkedColumn, b: LinkedColumn) =>
  a.entity === b.entity && a.field === b.field;

/** The key of the selection mirrored from `source` onto `target`. */
export function linkedSelectionKey(target: LinkedColumn, source: LinkedColumn): string {
  return `${LINKED_SELECTION_PREFIX}${columnKey(target)}<-${columnKey(source)}`;
}

/** Whether a selection key is a mirror rather than a filter someone set. */
export function isLinkedSelectionKey(key: string): boolean {
  return key.startsWith(LINKED_SELECTION_PREFIX);
}

/** The link group a column belongs to, and its member entry there. */
function findMember(
  groups: LinkGroup[],
  column: LinkedColumn,
): { group: LinkGroup; member: LinkMember } | null {
  for (const group of groups) {
    const member = group.members.find((m) => sameColumn(m, column));
    if (member) return { group, member };
  }
  return null;
}

const unique = (values: string[]) => [...new Set(values)];

/**
 * Point values on `from`, as the values on `to` they stand for. Through the
 * hub: `from`'s values become hub values, which become `to`'s.
 */
export function translateValues(from: LinkMember, to: LinkMember, values: unknown[]): string[] {
  const asText = values.map(String);
  if (sameColumn(from, to)) return asText;
  const hubValues = from.toHub ? asText.flatMap((v) => from.toHub![v] ?? [v]) : asText;
  if (!to.toHub) return unique(hubValues);
  // Every value of `to` that stands for a selected hub value. A hub value no
  // entry claims carries across as it is.
  const claimed = new Map<string, string[]>();
  for (const [own, hubs] of Object.entries(to.toHub)) {
    for (const h of hubs) claimed.set(h, [...(claimed.get(h) ?? []), own]);
  }
  return unique(hubValues.flatMap((h) => claimed.get(h) ?? [h]));
}

/**
 * Where a filter on `entity.field` is kept: the canonical column of its link
 * group, with point values translated. Unchanged for an unlinked column, or
 * one that is already canonical. Interval values carry across as they are —
 * a value map only names categories.
 */
export function canonicalFilter(
  groups: LinkGroup[],
  entity: string,
  field: string,
  type: DataSelection['type'],
  values: unknown[],
): { entity: string; field: string; values: unknown[] } {
  const found = findMember(groups, { entity, field });
  if (!found || sameColumn(found.member, found.group.canonical)) return { entity, field, values };
  const { group, member } = found;
  const canonical = group.members.find((m) => sameColumn(m, group.canonical))!;
  return {
    entity: canonical.entity,
    field: canonical.field,
    values: type === 'point' ? translateValues(member, canonical, values) : values,
  };
}

/** The column a filter on `entity.field` is kept on (see `canonicalFilter`). */
export function canonicalColumn(groups: LinkGroup[], entity: string, field: string): LinkedColumn {
  const found = findMember(groups, { entity, field });
  return found ? found.group.canonical : { entity, field };
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
export function linkedSelections(selections: DataSelections, groups: LinkGroup[]): DataSelections {
  const out: DataSelections = {};
  for (const { members } of groups) {
    for (const source of members) {
      const combined = combine(constraintsOn(selections, source));
      for (const target of members) {
        if (target === source) continue;
        const value =
          combined?.type === 'point'
            ? translateValues(source, target, combined.value)
            : combined?.value;
        // Re-keyed to the target's own column name.
        const selection = value ? ({ [target.field]: value } as DataSelection['selection']) : null;
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
  groups: LinkGroup[],
): DataSelections {
  if (groups.length === 0) return selections;
  return { ...selections, ...linkedSelections(selections, groups) };
}

/**
 * The value mirrored onto `entity.field` of the given type, if any: what a
 * chart on that column should show as its own selection when the filter is
 * kept on another column of its group.
 */
export function mirroredValue(
  selections: DataSelections,
  entity: string,
  field: string,
  type: DataSelection['type'],
): unknown[] | null {
  const prefix = `${LINKED_SELECTION_PREFIX}${entity}.${field}<-`;
  for (const [key, s] of Object.entries(selections)) {
    if (!key.startsWith(prefix) || s?.type !== type) continue;
    const value = (s.selection as Record<string, unknown> | null)?.[field];
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return null;
}

/**
 * Column (`entity.field`) → every table a filter on it reaches through links,
 * the column's own table excluded. Lets the cube rewrite tell a filter it
 * cannot serve from one a mirror already serves.
 */
export function linkedEntitiesByColumn(groups: LinkGroup[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { members } of groups) {
    for (const column of members) {
      out.set(
        columnKey(column),
        members.filter((c) => c.entity !== column.entity).map((c) => c.entity),
      );
    }
  }
  return out;
}
