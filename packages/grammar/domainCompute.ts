/**
 * Pure domain-computation logic. Shared between the Web Worker (which
 * runs it off the main thread) and the main-thread fallback path. No
 * top-level side effects so it's safe to import from either context.
 */

import type { DataFieldDomain, EntityComputeInput } from './domainTypes';

export function computeEntityDomains(
  resource: EntityComputeInput,
): DataFieldDomain[] {
  const domains: DataFieldDomain[] = [];

  for (const { name, values } of resource.columns) {
    const isNumeric = values.every((v) => v == null || !isNaN(+(v as number)));

    if (isNumeric) {
      let min = Infinity;
      let max = -Infinity;
      for (const v of values) {
        if (v == null) continue;
        const n = +(v as number);
        if (n < min) min = n;
        if (n > max) max = n;
      }
      domains.push({
        entity: resource.entityName,
        field: name,
        type: 'interval',
        fieldDescription: resource.fieldDescriptions[name] ?? '',
        domain: { min, max },
      });
    } else {
      domains.push({
        entity: resource.entityName,
        field: name,
        type: 'point',
        fieldDescription: resource.fieldDescriptions[name] ?? '',
        domain: { values: Array.from(new Set(values)) as string[] },
      });
    }
  }

  return domains;
}

// A cell value of a categorical column.
type Category = string | number | boolean | Date | null | undefined;

// Nulls last; numbers and dates by value; otherwise alphabetical, with digit
// runs compared as numbers so "2" sorts before "10".
function compareLabels(a: Category, b: Category): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  if (typeof a !== 'string' && typeof b !== 'string') return +a - +b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * A categorical scale domain: the distinct values of `field` in an order that
 * depends only on the values, never on the order the rows arrive in — so a
 * filter that reorders or drops rows cannot reshuffle the axis or the colors.
 * Alphabetical, or with `totalField`, by each value's sum of that field,
 * largest first, ties alphabetical.
 */
export function orderCategories(
  rows: object[],
  field: string,
  totalField?: string,
): Category[] {
  const totals = new Map<Category, number>();
  for (const row of rows as Record<string, Category>[]) {
    const value = row[field];
    const add = totalField ? Number(row[totalField]) || 0 : 0;
    totals.set(value, (totals.get(value) ?? 0) + add);
  }
  return [...totals.keys()].sort(
    (a, b) => totals.get(b)! - totals.get(a)! || compareLabels(a, b),
  );
}
