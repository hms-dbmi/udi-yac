import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDataFilters, useDataPackageStore } from '@/app/UDIChatContext';
import type { DataSelection } from '@/features/dashboard';

interface ChipInfo {
  id: string;
  dataSourceKey: string;
  type: string;
  label: string;
  value: string;
}

function formatSelectionFields(sel: DataSelection): { label: string; value: string }[] {
  const results: { label: string; value: string }[] = [];
  for (const [field, raw] of Object.entries(sel.selection ?? {})) {
    if (sel.type === 'interval') {
      const arr = Array.isArray(raw) ? raw : [];
      const [min, max] = arr as [number | undefined, number | undefined];
      const minStr = typeof min === 'number' ? min.toFixed(0) : '...';
      const maxStr = typeof max === 'number' ? max.toFixed(0) : '...';
      results.push({ label: field, value: `${minStr}\u2013${maxStr}` });
    } else if (sel.type === 'point') {
      const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      const displayArr = arr.map((v: unknown) => (v == null ? 'NULL' : String(v)));
      if (displayArr.length >= 3) {
        results.push({ label: field, value: `${displayArr[0]}, ${displayArr[1]}, ...` });
      } else {
        results.push({ label: field, value: displayArr.join(', ') });
      }
    } else {
      results.push({ label: field, value: JSON.stringify(raw) });
    }
  }
  return results;
}

export function FilterToolbar() {
  const dataPackageStore = useDataPackageStore();
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const internalDataSelections = useDataFilters((s) => s.internalDataSelections);
  const clearFilter = useDataFilters((s) => s.clearFilter);

  const chips = useMemo<ChipInfo[]>(() => {
    const validate = {
      isValidIntervalFilter: dataPackageStore.getState().isValidIntervalFilter,
      isValidPointFilter: dataPackageStore.getState().isValidPointFilter,
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

    const allEntries = [...validExternalSelections, ...Object.entries(internalDataSelections)];

    const result: ChipInfo[] = [];
    for (const [id, sel] of allEntries) {
      if (
        sel.selection == null ||
        Object.values(sel.selection).every((v) => v == null || (Array.isArray(v) && v.length === 0))
      )
        continue;
      const fields = formatSelectionFields(sel);
      for (const { label, value } of fields) {
        result.push({ id, dataSourceKey: sel.dataSourceKey, type: sel.type, label, value });
      }
    }
    return result;
  }, [dataSelections, internalDataSelections, dataPackageStore]);

  if (chips.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-1">
        Ask in the chat or interact with visualizations to add data filters.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map((chip) => (
        <div key={`${chip.id}-${chip.label}`} className="group relative inline-block">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -top-1.5 -right-1.5 z-10 h-4 w-4 rounded-full border bg-background shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => clearFilter(chip.id)}
                />
              }
            >
              <X className="h-2.5 w-2.5" />
            </TooltipTrigger>
            <TooltipContent>Clear filter</TooltipContent>
          </Tooltip>
          <Badge
            variant="outline"
            className="rounded-sm text-xs font-normal gap-1.5 cursor-default"
            title={`${chip.dataSourceKey} - ${chip.type}`}
          >
            <span className="font-medium">{chip.label}</span>
            <span className="font-mono">{chip.value}</span>
          </Badge>
        </div>
      ))}
    </div>
  );
}
