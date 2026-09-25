import { useMemo } from 'react';
import { useDataFilters, useDataPackageStore } from '@/app/UDIChatContext';
import type { DataSelection } from '../stores/dataFiltersStore';
import { brushHasValue, useBrushFilters } from './useBrushFilters';

export interface ChipInfo {
  id: string;
  dataSourceKey: string;
  type: string;
  label: string;
  value: string;
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
      const minStr = typeof min === 'number' ? min.toFixed(0) : '...';
      const maxStr = typeof max === 'number' ? max.toFixed(0) : '...';
      results.push({ label: labelFor(field), value: `${minStr}\u2013${maxStr}` });
    } else if (sel.type === 'point') {
      const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      const displayArr = arr.map((v: unknown) => (v == null ? 'NULL' : valueFor(String(v))));
      if (displayArr.length >= 3) {
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

/**
 * One chip per active filter: the chat's FilterData selections that still
 * validate against the package, plus brush/click selections on active
 * visualizations. Shared by the Filters section and by the dashboard, which
 * drops the section's band when a read-only view has nothing to show in it.
 */
export function useFilterChips(): ChipInfo[] {
  const dataPackageStore = useDataPackageStore();
  const dataSelections = useDataFilters((s) => s.dataSelections);
  // Brush/click selections, gated to currently-active visualizations so a
  // closed viz's stale selection never renders a chip.
  const brushFilters = useBrushFilters();

  return useMemo<ChipInfo[]>(() => {
    const dpState = dataPackageStore.getState();
    const validate = {
      isValidIntervalFilter: dpState.isValidIntervalFilter,
      isValidPointFilter: dpState.isValidPointFilter,
    };

    const validExternalSelections = Object.entries(dataSelections).filter(([key, sel]) => {
      if (!sel.selection || Object.keys(sel.selection).length === 0) return false;
      if (Object.values(sel.selection).every((v) => Array.isArray(v) && v.length === 0))
        return false;
      if (!key.startsWith('message-filter-')) return false;
      if (sel.type === 'interval') {
        return (
          validate.isValidIntervalFilter(sel.dataSourceKey, Object.keys(sel.selection)[0])
            .isValid === 'yes'
        );
      }
      if (sel.type === 'point') {
        return (
          validate.isValidPointFilter(
            sel.dataSourceKey,
            Object.keys(sel.selection)[0],
            Object.values(sel.selection)[0] as unknown[],
          ).isValid === 'yes'
        );
      }
      return false;
    });

    // Visualization brush/click selections (already gated to active vizzes;
    // point selections arrive pre-split, one filter per field, so each chip
    // clears independently). A present-but-empty point filter keeps its chat
    // widget but has no chip.
    const brushEntries: [string, DataSelection][] = brushFilters
      .filter((b) => brushHasValue(b.selection))
      .map((b) => [b.id, b.selection]);

    const allEntries = [...validExternalSelections, ...brushEntries];

    const result: ChipInfo[] = [];
    for (const [id, sel] of allEntries) {
      if (
        sel.selection == null ||
        Object.values(sel.selection).every((v) => v == null || (Array.isArray(v) && v.length === 0))
      )
        continue;
      const fields = formatSelectionFields(
        sel,
        (field) => dpState.getFieldLabel(sel.dataSourceKey, field),
        dpState.getValueLabel,
      );
      for (const { label, value } of fields) {
        result.push({ id, dataSourceKey: sel.dataSourceKey, type: sel.type, label, value });
      }
    }
    return result;
  }, [dataSelections, brushFilters, dataPackageStore]);
}
