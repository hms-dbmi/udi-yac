import { useMemo } from 'react';
import { useDataFilters, useDataPackage, useDataPackageStore } from '@/app/UDIChatContext';
import {
  HOST_FILTER_PREFIX,
  isChatFilterKey,
  isValidSelection,
  type DataSelection,
  type DataSelections,
  type FilterOrigin,
} from '../stores/dataFiltersStore';
import { formatTime } from 'udi-toolkit/react';
import { scopePhrase } from '../utils/filterScope';

/** A filter in place, whatever made it. `id` is what the store's filter
 *  actions (`setFilter`, `clearFilter`, `removeFilter`, ...) take. */
export interface ActiveFilter {
  id: string;
  origin: FilterOrigin;
  selection: DataSelection;
}

export interface ChipInfo {
  id: string;
  origin: FilterOrigin;
  dataSourceKey: string;
  type: string;
  label: string;
  value: string;
  /** The scope in words ("Patient with any Event where"), or null when the
   *  filter is about rows. */
  scope: string | null;
  /** The whole filter the chip summarizes — its popover edits this. */
  selection: DataSelection;
}

/**
 * Chip text for one selection. `labelFor` / `valueFor` are the data package's
 * display labels — a chip is chrome summarizing a filter, so it shows "CHOP"
 * where the filter itself still holds the full institution name. A field with
 * a `timeFormat` (`udi:time_format`) shows its bounds as dates, years or ages.
 */
export function formatSelectionFields(
  sel: DataSelection,
  labelFor: (field: string) => string,
  valueFor: (value: string) => string,
  domainOf: (field: string) => readonly unknown[] | undefined = () => undefined,
  timeFormat: (field: string) => string | undefined = () => undefined,
): { label: string; value: string }[] {
  const results: { label: string; value: string }[] = [];
  for (const [field, raw] of Object.entries(sel.selection ?? {})) {
    if (sel.type === 'interval') {
      const arr = Array.isArray(raw) ? raw : [];
      const [min, max] = arr as [number | undefined, number | undefined];
      if (arr.length < 2) {
        results.push({ label: labelFor(field), value: 'All' });
        continue;
      }
      const format = timeFormat(field);
      const bound = (n: number) => (format ? formatTime(n, format) : n.toFixed(0));
      const minStr = typeof min === 'number' ? bound(min) : '...';
      const maxStr = typeof max === 'number' ? bound(max) : '...';
      results.push({ label: labelFor(field), value: `${minStr}\u2013${maxStr}` });
    } else if (sel.type === 'point') {
      const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      const displayArr = arr.map((v: unknown) => (v == null ? 'NULL' : valueFor(String(v))));
      // Every value checked takes in every row, as none checked does, and the
      // select-all row makes it a common state: say so rather than list them.
      const domain = domainOf(field);
      const everyValue = !!domain?.length && domain.every((v) => arr.includes(v));
      if (displayArr.length === 0 || everyValue) {
        results.push({ label: labelFor(field), value: 'All' });
      } else if (displayArr.length >= 3) {
        results.push({ label: labelFor(field), value: `${displayArr[0]}, ${displayArr[1]}, ...` });
      } else {
        results.push({ label: labelFor(field), value: displayArr.join(', ') });
      }
    } else {
      results.push({ label: labelFor(field), value: JSON.stringify(raw) });
    }
  }
  return results;
}

type Validate = Parameters<typeof isValidSelection>[1];

/**
 * Every filter currently in place, one per column (set in chat or on a chart),
 * then the host's — in the order they were made. Filters the package rules
 * out are skipped. Cleared (all-inclusive) filters are included — they keep
 * their chip — and removed ones are not. A chart-made filter outlives its
 * chart. Exported for unit testing; components use `useActiveFilters`.
 */
export function selectFilters(
  dataSelections: DataSelections,
  filterOrigins: Record<string, FilterOrigin>,
  removedFilters: Record<string, true>,
  validate: Validate,
): ActiveFilter[] {
  const result: ActiveFilter[] = [];
  for (const [id, selection] of Object.entries(dataSelections)) {
    if (!isChatFilterKey(id) || removedFilters[id]) continue;
    if (!isValidSelection(selection, validate)) continue;
    const origin: FilterOrigin = id.startsWith(HOST_FILTER_PREFIX)
      ? 'host'
      : (filterOrigins[id] ?? 'chat');
    result.push({ id, origin, selection });
  }
  return result;
}

export function useActiveFilters(): ActiveFilter[] {
  const dataPackageStore = useDataPackageStore();
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const filterOrigins = useDataFilters((s) => s.filterOrigins);
  const removedFilters = useDataFilters((s) => s.removedFilters);

  return useMemo(() => {
    const dpState = dataPackageStore.getState();
    return selectFilters(dataSelections, filterOrigins, removedFilters, {
      isValidIntervalFilter: dpState.isValidIntervalFilter,
      isValidPointFilter: dpState.isValidPointFilter,
    });
  }, [dataSelections, filterOrigins, removedFilters, dataPackageStore]);
}

/**
 * One chip per field of each filter in place. Shared by the Filters section
 * and by the dashboard, which drops the section's band when a read-only view
 * has nothing to show in it.
 */
export function useFilterChips(): ChipInfo[] {
  const dataPackageStore = useDataPackageStore();
  const filters = useActiveFilters();
  // Subscribed, so a chip re-reads "All" once the domains it is checked
  // against arrive.
  const domains = useDataPackage((s) => s.dataFieldDomains);
  const scopes = useDataFilters((s) => s.filterScopes);

  return useMemo<ChipInfo[]>(() => {
    const dpState = dataPackageStore.getState();
    return filters.flatMap(({ id, origin, selection }) =>
      formatSelectionFields(
        selection,
        (field) => dpState.getFieldLabel(selection.dataSourceKey, field),
        dpState.getValueLabel,
        (field) => {
          const domain = domains.find(
            (d) => d.entity === selection.dataSourceKey && d.field === field,
          )?.domain;
          return (domain as { values?: unknown[] } | undefined)?.values;
        },
        (field) => dpState.getTimeFormat(selection.dataSourceKey, field),
      ).map(({ label, value }) => ({
        id,
        origin,
        dataSourceKey: selection.dataSourceKey,
        type: selection.type,
        label,
        value,
        scope: scopePhrase(scopes[id], selection.dataSourceKey),
        selection,
      })),
    );
  }, [filters, dataPackageStore, domains, scopes]);
}
