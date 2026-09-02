import { useMemo } from 'react';
import { IntervalFilterComponent } from './IntervalFilterComponent';
import { PointFilterComponent } from './PointFilterComponent';
import { UnmatchedFilterNotice } from './UnmatchedFilterNotice';
import { useDataFilters, useDataPackage } from '@/app/UDIChatContext';
import { diagnoseFilter, type FilterProbe } from '@/features/data-package';
import {
  filterSpecForToolCall,
  messageFilterKeyWithToolCall,
  messageFilterKey as mkFilterKey,
} from '@/features/dashboard';
import type { Message } from '@/types/messages';

interface FilterComponentProps {
  message: Message;
  messageIndex: number;
  toolCallIndex?: number;
  tweakable?: boolean;
}

export function FilterComponent({
  message,
  messageIndex,
  toolCallIndex,
  tweakable = true,
}: FilterComponentProps) {
  const dataSelections = useDataFilters((s) => s.dataSelections);
  // Subscribed, not read through a stable function slice: the verdict below
  // must change when a streaming domain lands, or a notice rendered during the
  // 'domains' phase would freeze at a false "no matching values".
  const dataFieldDomains = useDataPackage((s) => s.dataFieldDomains);
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const entityNames = useDataPackage((s) => s.entityNames);

  const filterArgs = useMemo(
    () => filterSpecForToolCall(message, toolCallIndex),
    [message, toolCallIndex],
  );
  const filterType = filterArgs?.filter?.filterType ?? null;

  const filterKey = useMemo(() => {
    return toolCallIndex != null
      ? messageFilterKeyWithToolCall(messageIndex, toolCallIndex, message)
      : mkFilterKey(messageIndex, message);
  }, [messageIndex, toolCallIndex, message]);

  const dataSelection = dataSelections[filterKey] ?? null;

  // Diagnose the STORED selection once one exists, falling back to what the
  // assistant asked for. Re-diagnosing the original args forever would leave
  // the notice on screen after the user has already repaired the filter.
  const probe = useMemo<FilterProbe | null>(() => {
    const storedField = dataSelection?.selection
      ? Object.keys(dataSelection.selection)[0]
      : undefined;
    if (dataSelection && storedField) {
      return {
        entity: dataSelection.dataSourceKey,
        field: storedField,
        kind: dataSelection.type === 'interval' ? 'interval' : 'point',
        values: (dataSelection.selection as Record<string, unknown[]>)[storedField],
      };
    }
    if (!filterArgs || !filterType) return null;
    return {
      entity: filterArgs.entity,
      field: filterArgs.field,
      kind: filterType,
      values: filterArgs.filter.pointValues,
    };
  }, [dataSelection, filterArgs, filterType]);

  const diagnosis = useMemo(
    () =>
      probe
        ? diagnoseFilter(probe, { sourceFields, entityNames, dataFieldDomains, loadingPhase })
        : null,
    [probe, sourceFields, entityNames, dataFieldDomains, loadingPhase],
  );

  if (!filterType || !probe || !diagnosis) return null;

  // Brush-origin messages key into `internalDataSelections`, so the lookup here
  // is always empty — diagnosing one would render a spurious notice.
  if (message.linkedVisFilterId != null) return null;

  // `clearFilter` keeps the entry with a null selection, which would otherwise
  // fall through to the widget's own "Error: Invalid filter."
  if (dataSelection && dataSelection.selection === null) {
    return <span className="p-2 text-sm text-muted-foreground">Filter cleared.</span>;
  }

  if (diagnosis.kind === 'loading') return null;

  // Three verdicts still render the genuine widget:
  //   ok            — the filter is valid;
  //   unverifiable  — can't check, not wrong (a remote field whose domain was
  //                   dropped), so let the backend decide;
  //   empty-request — nothing was asked for. That's mid-interaction, not a
  //                   failure: unticking the last box commits `[]`, and
  //                   swapping in the notice there would yank the widget out
  //                   from under the user. It's also the landing state after
  //                   the notice's own "did you mean this field?" repair.
  if (
    diagnosis.kind !== 'ok' &&
    diagnosis.kind !== 'unverifiable' &&
    diagnosis.kind !== 'empty-request'
  ) {
    return (
      <div className="p-2">
        <UnmatchedFilterNotice diagnosis={diagnosis} filterKey={filterKey} />
      </div>
    );
  }

  if (!dataSelection) return null;

  const allFields = Object.keys(dataSelection.selection ?? {});

  if (filterType === 'interval') {
    return (
      <div className="space-y-3 p-2">
        {allFields.map((_, idx) => (
          <IntervalFilterComponent
            key={idx}
            dataSelection={dataSelection}
            fieldIndex={idx}
            tweakable={tweakable}
            filterKey={filterKey}
          />
        ))}
      </div>
    );
  }

  if (filterType === 'point') {
    return (
      <div className="p-2">
        <PointFilterComponent
          dataSelection={dataSelection}
          tweakable={tweakable}
          filterKey={filterKey}
        />
      </div>
    );
  }

  return null;
}
