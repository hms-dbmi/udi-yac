import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useDataPackage, useDataFilters } from '@/app/UDIChatContext';
import type { DataSelection } from '@/features/dashboard';
import type { RangeSelection } from 'udi-toolkit/react';

interface IntervalFilterComponentProps {
  dataSelection: DataSelection;
  fieldIndex: number;
  tweakable: boolean;
  filterKey: string;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export function IntervalFilterComponent({
  dataSelection,
  fieldIndex,
  tweakable,
  filterKey,
}: IntervalFilterComponentProps) {
  const entityNames = useDataPackage((s) => s.entityNames);
  const quantitativeSourceFields = useDataPackage((s) => s.quantitativeSourceFields);
  const getDomainForField = useDataPackage((s) => s.getDomainForField);
  const isValidIntervalFilter = useDataPackage((s) => s.isValidIntervalFilter);
  const setDataSelection = useDataFilters((s) => s.setDataSelection);

  const entity = dataSelection.dataSourceKey;
  const field = Object.keys(dataSelection.selection ?? {})[fieldIndex] ?? '';

  const rangeMinMax = useMemo(() => {
    const domain = getDomainForField(entity, field);
    if (!domain || domain.type !== 'interval') return { min: 0, max: 100 };
    return {
      min: (domain.domain as { min: number; max: number }).min,
      max: (domain.domain as { min: number; max: number }).max,
    };
  }, [getDomainForField, entity, field]);

  const storeRange = useMemo(() => {
    const arr = dataSelection.selection?.[field] as number[] | undefined;
    if (!arr || arr.length < 2) return [rangeMinMax.min, rangeMinMax.max];
    return [arr[0], arr[1]];
  }, [dataSelection.selection, field, rangeMinMax]);

  // Local state for responsive slider; committed to store on debounce
  const [localRange, setLocalRange] = useState(storeRange);
  const commitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync local state when store range changes externally (e.g. reset, session load)
  useEffect(() => {
    setLocalRange(storeRange);
  }, [storeRange]);

  const commitToStore = useCallback(
    (range: number[]) => {
      const current = (dataSelection.selection ?? {}) as RangeSelection;
      const nextSelection: RangeSelection = {
        ...current,
        [field]: [range[0], range[1]],
      };
      setDataSelection(filterKey, { ...dataSelection, selection: nextSelection });
    },
    [setDataSelection, filterKey, dataSelection, field],
  );

  const handleRangeChange = useCallback(
    (value: number | readonly number[]) => {
      const arr = Array.isArray(value) ? [...value] : [value];
      if (arr.length < 2) return;
      setLocalRange(arr);
      clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => commitToStore(arr), 250);
    },
    [commitToStore],
  );

  const handleReset = useCallback(() => {
    const reset = [rangeMinMax.min, rangeMinMax.max];
    setLocalRange(reset);
    clearTimeout(commitTimer.current);
    commitToStore(reset);
  }, [commitToStore, rangeMinMax]);

  const handleEntityChange = useCallback(
    (val: string | null) => {
      if (!val) return;
      setDataSelection(filterKey, {
        ...dataSelection,
        dataSourceKey: val,
        selection: { [field]: [rangeMinMax.min, rangeMinMax.max] },
      });
    },
    [setDataSelection, filterKey, dataSelection, field, rangeMinMax],
  );

  const handleFieldChange = useCallback(
    (val: string | null) => {
      if (!val) return;
      const newDomain = getDomainForField(entity, val);
      const min =
        newDomain?.type === 'interval' ? (newDomain.domain as { min: number; max: number }).min : 0;
      const max =
        newDomain?.type === 'interval'
          ? (newDomain.domain as { min: number; max: number }).max
          : 100;
      setDataSelection(filterKey, {
        ...dataSelection,
        selection: { [val]: [min, max] },
      });
    },
    [setDataSelection, filterKey, dataSelection, getDomainForField, entity],
  );

  const fieldOptions = quantitativeSourceFields?.[entity] ?? [];
  const isValid = isValidIntervalFilter(entity, field).isValid === 'yes';

  const minText = localRange[0] <= rangeMinMax.min ? 'min' : formatNumber(localRange[0]);
  const maxText = localRange[1] >= rangeMinMax.max ? 'max' : formatNumber(localRange[1]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm">
        {tweakable ? (
          <>
            <span className="text-muted-foreground">Filtering</span>
            <Select value={entity} onValueChange={handleEntityChange}>
              <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {entityNames.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={field} onValueChange={handleFieldChange}>
              <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fieldOptions.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <span className="text-muted-foreground">
            Filtering {entity} {field}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <span className="font-semibold">{minText}</span>
        <span className="text-muted-foreground">to</span>
        <span className="font-semibold">{maxText}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleReset}>
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>
      {isValid ? (
        <Slider
          value={localRange}
          min={rangeMinMax.min}
          max={rangeMinMax.max}
          step={(rangeMinMax.max - rangeMinMax.min) / 100}
          onValueChange={handleRangeChange}
        />
      ) : (
        <span className="text-sm text-destructive">Error: Invalid filter.</span>
      )}
    </div>
  );
}
