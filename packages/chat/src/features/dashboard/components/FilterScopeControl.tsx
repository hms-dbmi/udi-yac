import { useDataFilters, useDataFiltersStore, useDataPackage } from '@/app/UDIChatContext';
import type { FilterMatch } from '@/features/tool-calls';
import { cn } from '@/lib/utils';
import { isChatFilterKey, type DataSelection } from '../stores/dataFiltersStore';
import { SCOPE_OPTIONS, scopePhrase, scopeSubjects } from '../utils/filterScope';

/**
 * Whether a filter tests rows or subjects: one control, rows | any | all |
 * none. "rows" keeps the matching rows; the others keep every row of each
 * subject (a patient, a donor) with any, every or no matching row. Only chat
 * and host filters have a scope — a chart brush is always about its rows.
 * Hidden when the filter's table links to nothing it could be scoped to.
 */
export function FilterScopeControl({
  filterId,
  selection,
}: {
  filterId: string;
  selection: DataSelection;
}) {
  const scope = useDataFilters((s) => s.filterScopes[filterId] ?? null);
  const dataFiltersStore = useDataFiltersStore();
  const dataPackage = useDataPackage((s) => s.dataPackage);
  const entity = selection.dataSourceKey;
  const subject = scope?.entity ?? scopeSubjects(dataPackage, entity)[0];

  if (!isChatFilterKey(filterId) || !subject) return null;

  const current = scope?.match ?? 'rows';
  const choose = (value: 'rows' | FilterMatch) =>
    dataFiltersStore
      .getState()
      .setFilterScope(filterId, value === 'rows' ? null : { entity: subject, match: value });

  return (
    <div className="udi:flex udi:flex-wrap udi:items-center udi:gap-x-2 udi:gap-y-1 udi:px-2 udi:pt-1 udi:text-xs">
      <span className="udi:text-muted-foreground" id={`${filterId}-scope`}>
        Match per {subject}:
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${filterId}-scope`}
        className="udi:inline-flex udi:overflow-hidden udi:rounded-md udi:border"
      >
        {SCOPE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={current === value}
            onClick={() => choose(value)}
            className={cn(
              'udi:px-2 udi:py-0.5 udi:not-first:border-l',
              current === value
                ? 'udi:bg-primary udi:text-primary-foreground'
                : 'udi:hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="udi:w-full udi:text-muted-foreground">
        {scopePhrase(scope, entity) ?? `Keeps the matching ${entity} rows.`}
      </span>
    </div>
  );
}
