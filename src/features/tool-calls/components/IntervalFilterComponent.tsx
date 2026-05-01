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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RotateCcw } from 'lucide-react';
import { useDataPackage, useDataFilters, useTracker } from '@/app/UDIChatContext';
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
  const trackEvent = useTracker();

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

  // Local state for responsive slider; committed to store once per animation
  // frame so dependent views update live without flooding the store on every
  // pointermove.
  const [localRange, setLocalRange] = useState(storeRange);
  const pendingRangeRef = useRef<number[] | null>(null);
  const commitFrameRef = useRef<number | null>(null);

  // Sync local state when store range changes externally (e.g. reset, session load)
  useEffect(() => {
    setLocalRange(storeRange);
  }, [storeRange]);

  // Cancel any pending frame on unmount so we don't touch the store after teardown.
  useEffect(() => {
    return () => {
      if (commitFrameRef.current != null) cancelAnimationFrame(commitFrameRef.current);
    };
  }, []);

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

  const scheduleCommit = useCallback(
    (range: number[]) => {
      pendingRangeRef.current = range;
      if (commitFrameRef.current != null) return;
      commitFrameRef.current = requestAnimationFrame(() => {
        commitFrameRef.current = null;
        const pending = pendingRangeRef.current;
        pendingRangeRef.current = null;
        if (pending) commitToStore(pending);
      });
    },
    [commitToStore],
  );

  const handleRangeChange = useCallback(
    (value: number | readonly number[]) => {
      const arr = Array.isArray(value) ? [...value] : [value];
      if (arr.length < 2) return;
      setLocalRange(arr);
      scheduleCommit(arr);
    },
    [scheduleCommit],
  );

  // Fire analytics once at drag-resolve rather than on every rAF commit, so a
  // single drag produces one event instead of dozens. The data store is still
  // updated continuously via scheduleCommit above for live downstream views.
  const handleRangeCommit = useCallback(
    (value: number | readonly number[]) => {
      const arr = Array.isArray(value) ? [...value] : [value];
      if (arr.length < 2) return;
      trackEvent('filter_range_changed', {
        entity,
        field,
        isReset: false,
        isFullRange: arr[0] <= rangeMinMax.min && arr[1] >= rangeMinMax.max,
      });
    },
    [trackEvent, entity, field, rangeMinMax],
  );

  const handleReset = useCallback(() => {
    const reset = [rangeMinMax.min, rangeMinMax.max];
    setLocalRange(reset);
    if (commitFrameRef.current != null) {
      cancelAnimationFrame(commitFrameRef.current);
      commitFrameRef.current = null;
    }
    pendingRangeRef.current = null;
    commitToStore(reset);
    trackEvent('filter_range_changed', {
      entity,
      field,
      isReset: true,
      isFullRange: true,
    });
  }, [commitToStore, rangeMinMax, trackEvent, entity, field]);

  const handleEntityChange = useCallback(
    (val: string | null) => {
      if (!val) return;
      setDataSelection(filterKey, {
        ...dataSelection,
        dataSourceKey: val,
        selection: { [field]: [rangeMinMax.min, rangeMinMax.max] },
      });
      trackEvent('filter_entity_changed', {
        filterType: 'interval',
        entity: val,
        field,
      });
    },
    [setDataSelection, filterKey, dataSelection, field, rangeMinMax, trackEvent],
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
      trackEvent('filter_field_changed', {
        filterType: 'interval',
        entity,
        field: val,
      });
    },
    [setDataSelection, filterKey, dataSelection, getDomainForField, entity, trackEvent],
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
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleReset} />
            }
          >
            <RotateCcw className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent>Reset range</TooltipContent>
        </Tooltip>
      </div>
      {isValid ? (
        <Slider
          value={localRange}
          min={rangeMinMax.min}
          max={rangeMinMax.max}
          step={(rangeMinMax.max - rangeMinMax.min) / 100}
          onValueChange={handleRangeChange}
          onValueCommitted={handleRangeCommit}
        />
      ) : (
        <span className="text-sm text-destructive">Error: Invalid filter.</span>
      )}
    </div>
  );
}
