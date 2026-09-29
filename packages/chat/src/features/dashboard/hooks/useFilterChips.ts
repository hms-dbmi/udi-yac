import { useMemo } from 'react';
import { useDashboard, useDataFilters, useDataPackageStore } from '@/app/UDIChatContext';
import {
  HOST_FILTER_PREFIX,
  isChatFilterKey,
  isValidSelection,
  type DataSelection,
  type DataSelections,
  type FilterOrigin,
} from '../stores/dataFiltersStore';
import type { ActiveVisualization } from '../stores/dashboardStore';
import { selectBrushFilters } from './useBrushFilters';

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
  /** The whole filter the chip summarizes — its popover edits this. */
  selection: DataSelection;
}

/**
 * Chip text for one selection. `labelFor` / `valueFor` are the data package's
 * display labels — a chip is chrome summarizing a filter, so it shows "CHOP"
 * where the filter itself still holds the full institution name.
 */
function formatSelectionFields(
  sel: DataSelection,
  labelFor: (field: string) => string,
  valueFor: (value: string) => string,
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
      const minStr = typeof min === 'number' ? min.toFixed(0) : '...';
      const maxStr = typeof max === 'number' ? max.toFixed(0) : '...';
      results.push({ label: labelFor(field), value: `${minStr}\u2013${maxStr}` });
    } else if (sel.type === 'point') {
      const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      const displayArr = arr.map((v: unknown) => (v == null ? 'NULL' : valueFor(String(v))));
      if (displayArr.length === 0) {
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
 * Every filter currently in place, in chip order: the chat's FilterData
 * selections and the host's `filters` that the package admits, then brush/click
 * selections on active visualizations. Cleared (all-inclusive) filters are
 * included — they keep their chip — and removed ones are not. Exported for
 * unit testing; components use `useActiveFilters`.
 */
export function selectFilters(
  dataSelections: DataSelections,
  internalDataSelections: DataSelections,
  activeVisualizations: Map<string, ActiveVisualization>,
  removedFilters: Record<string, true>,
  validate: Validate,
): ActiveFilter[] {
  const result: ActiveFilter[] = [];
  for (const [id, selection] of Object.entries(dataSelections)) {
    if (!isChatFilterKey(id) || removedFilters[id]) continue;
    if (!isValidSelection(selection, validate)) continue;
    result.push({ id, origin: id.startsWith(HOST_FILTER_PREFIX) ? 'host' : 'chat', selection });
  }
  for (const brush of selectBrushFilters(internalDataSelections, activeVisualizations)) {
    if (removedFilters[brush.id]) continue;
    result.push({ id: brush.id, origin: 'chart', selection: brush.selection });
  }
  return result;
}

export function useActiveFilters(): ActiveFilter[] {
  const dataPackageStore = useDataPackageStore();
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const internalDataSelections = useDataFilters((s) => s.internalDataSelections);
  const removedFilters = useDataFilters((s) => s.removedFilters);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);

  return useMemo(() => {
    const dpState = dataPackageStore.getState();
    return selectFilters(
      dataSelections,
      internalDataSelections,
      activeVisualizations,
      removedFilters,
      {
        isValidIntervalFilter: dpState.isValidIntervalFilter,
        isValidPointFilter: dpState.isValidPointFilter,
      },
    );
  }, [
    dataSelections,
    internalDataSelections,
    activeVisualizations,
    removedFilters,
    dataPackageStore,
  ]);
}

/**
 * One chip per field of each filter in place. Shared by the Filters section
 * and by the dashboard, which drops the section's band when a read-only view
 * has nothing to show in it.
 */
export function useFilterChips(): ChipInfo[] {
  const dataPackageStore = useDataPackageStore();
  const filters = useActiveFilters();

  return useMemo<ChipInfo[]>(() => {
    const dpState = dataPackageStore.getState();
    return filters.flatMap(({ id, origin, selection }) =>
      formatSelectionFields(
        selection,
        (field) => dpState.getFieldLabel(selection.dataSourceKey, field),
        dpState.getValueLabel,
      ).map(({ label, value }) => ({
        id,
        origin,
        dataSourceKey: selection.dataSourceKey,
        type: selection.type,
        label,
        value,
        selection,
      })),
    );
  }, [filters, dataPackageStore]);
}
