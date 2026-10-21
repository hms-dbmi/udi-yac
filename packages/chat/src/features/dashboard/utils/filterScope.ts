import type { FilterMatch, FilterScope } from '@/features/tool-calls';
import type { DataPackage } from '@/types/dataPackage';

/** The words a scoped filter's condition follows, e.g. "Patient with any
 *  Event where". Null for a row-level filter, which needs none. */
export function scopePhrase(scope: FilterScope | null | undefined, entity: string): string | null {
  if (!scope) return null;
  const subject = scope.entity;
  switch (scope.match) {
    case 'any':
      return `${subject} with any ${entity} where`;
    case 'all':
      return `${subject} where every ${entity} has`;
    case 'none':
      return `${subject} with no ${entity} where`;
  }
}

/**
 * The tables a filter on `entity` can be scoped to: those it has a direct
 * foreign key to (its parents, which is nearly always what "per patient"
 * means), then those with a direct foreign key to it.
 */
export function scopeSubjects(dataPackage: DataPackage | null, entity: string): string[] {
  const resources = dataPackage?.resources ?? [];
  const parents =
    resources
      .find((r) => r.name === entity)
      ?.schema?.foreignKeys?.map((fk) => fk.reference.resource) ?? [];
  const children = resources
    .filter((r) => r.schema?.foreignKeys?.some((fk) => fk.reference.resource === entity))
    .map((r) => r.name);
  return Array.from(new Set([...parents, ...children])).filter((n) => n && n !== entity);
}

export const SCOPE_OPTIONS: Array<{ value: 'rows' | FilterMatch; label: string }> = [
  { value: 'rows', label: 'rows' },
  { value: 'any', label: 'any' },
  { value: 'all', label: 'all' },
  { value: 'none', label: 'none' },
];
