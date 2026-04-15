import { useMemo } from 'react';
import { IntervalFilterComponent } from './IntervalFilterComponent';
import { PointFilterComponent } from './PointFilterComponent';
import { useDataFilters } from '@/app/UDIChatContext';
import {
  extractFilterSpecFromMessage,
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

  const filterArgs = useMemo(() => extractFilterSpecFromMessage(message), [message]);
  const filterType = filterArgs?.filter?.filterType ?? null;

  const filterKey = useMemo(() => {
    return toolCallIndex != null
      ? messageFilterKeyWithToolCall(messageIndex, toolCallIndex, message)
      : mkFilterKey(messageIndex, message);
  }, [messageIndex, toolCallIndex, message]);

  const dataSelection = dataSelections[filterKey] ?? null;

  if (!dataSelection || !filterType) return null;

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
