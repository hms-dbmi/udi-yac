import type { ReactNode } from 'react';
import { FilterCollapsible, FilterControls, type BrushFilter } from '@/features/dashboard';
import { FilterComponent } from '@/features/tool-calls';
import type { Message } from '@/types/messages';

/** A filter item laid out like an assistant bubble, so it reads as a chat message. */
function FilterBubble({ children }: { children: ReactNode }) {
  return (
    <div data-message className="udi:flex udi:scroll-mt-6 udi:justify-start">
      <div className="udi:max-w-[85%] udi:min-w-0 udi:rounded-lg udi:bg-muted udi:px-3 udi:py-2 udi:wrap-break-word">
        {children}
      </div>
    </div>
  );
}

/**
 * The chat's adjustment widget for a filter a chart created, presented like an
 * LLM-originated `FilterData` filter — collapsing it removes the filter,
 * expanding restores it cleared. A chart's clicks and brushes are written into
 * the column filters, not the conversation, so these never leak into the LLM
 * message history. MessageList places each where the chart made it.
 */
export function BrushFilterWidget({ brush }: { brush: BrushFilter }) {
  return (
    <FilterBubble>
      <FilterCollapsible filterId={brush.id} selection={brush.selection}>
        <FilterControls filterId={brush.id} selection={brush.selection} tweakable={false} />
      </FilterCollapsible>
    </FilterBubble>
  );
}

/**
 * A `FilterData` filter from a message the chat no longer shows (leaving the
 * read-only view hides the transcript). The filter still applies, so its
 * widget stays — without it, the only control left would be the filter bar's
 * chip, which can't change what the filter is about or restore it once removed.
 */
export function HiddenFilterWidget({
  message,
  messageIndex,
  toolCallIndex,
}: {
  message: Message;
  messageIndex: number;
  toolCallIndex: number;
}) {
  return (
    <FilterBubble>
      <FilterComponent
        message={message}
        messageIndex={messageIndex}
        toolCallIndex={toolCallIndex}
      />
    </FilterBubble>
  );
}
