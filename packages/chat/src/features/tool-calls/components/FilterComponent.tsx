import { useMemo } from 'react';
import { UnmatchedFilterNotice } from './UnmatchedFilterNotice';
import { useDataFilters, useDataPackage } from '@/app/UDIChatContext';
import { diagnoseFilter, type FilterProbe } from '@/features/data-package';
import {
  canonicalColumn,
  columnFilterKey,
  FilterCollapsible,
  FilterControls,
  extractFilterOperationsFromMessage,
  isFilterDefinition,
} from '@/features/dashboard';
import type { Message } from '@/types/messages';

interface FilterComponentProps {
  message: Message;
  toolCallIndex?: number;
  tweakable?: boolean;
}

export function FilterComponent({
  message,
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
  const dimensionLinks = useDataPackage((s) => s.dimensionLinks);

  const operation = useMemo(
    () =>
      extractFilterOperationsFromMessage(message).find(
        (f) => toolCallIndex == null || f.toolCallIndex === toolCallIndex,
      )?.args ?? null,
    [message, toolCallIndex],
  );
  const filterArgs = operation && isFilterDefinition(operation) ? operation : null;
  const filterType = filterArgs?.filter?.filterType ?? null;

  // One filter per column, whichever call set it last — so every widget for a
  // column, an add's or a modify's, controls the same filter.
  // A filter on a linked column is kept on its group's canonical column.
  const filterColumn = filterArgs
    ? canonicalColumn(dimensionLinks, filterArgs.entity, filterArgs.field)
    : null;
  const filterKey = filterColumn ? columnFilterKey(filterColumn.entity, filterColumn.field) : null;
  const dataSelection = (filterKey && dataSelections[filterKey]) || null;

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

  if (operation?.op === 'remove') {
    return (
      <p className="udi:p-2 udi:text-sm udi:text-muted-foreground">
        Removed the filter{operation.title ? ` “${operation.title}”` : ''}.
      </p>
    );
  }
  if (operation?.op === 'clear') {
    return (
      <p className="udi:p-2 udi:text-sm udi:text-muted-foreground">Cleared the filters I made.</p>
    );
  }

  if (!filterKey || !filterType || !probe || !diagnosis) return null;

  // Brush messages from old sessions (`linkedVisFilterId`) carry no filter of
  // their own — diagnosing one would render a spurious notice.
  if (message.linkedVisFilterId != null) return null;

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
      <div className="udi:p-2">
        <UnmatchedFilterNotice diagnosis={diagnosis} filterKey={filterKey} />
      </div>
    );
  }

  // Removed since — by the agent, or with the chart that last set it. Say so
  // rather than leave the message an empty bubble.
  if (!dataSelection) {
    return (
      <p className="udi:p-2 udi:text-sm udi:text-muted-foreground">
        This filter{filterArgs?.title ? ` (“${filterArgs.title}”)` : ''} has since been removed.
      </p>
    );
  }

  return (
    <FilterCollapsible filterId={filterKey} selection={dataSelection}>
      <FilterControls filterId={filterKey} selection={dataSelection} tweakable={tweakable} />
    </FilterCollapsible>
  );
}
