import type { ReactNode } from 'react';
import { extractAllFilterSpecsFromMessage, type BrushFilter } from '@/features/dashboard';
import type { Message } from '@/types/messages';
import { BrushFilterWidget, HiddenFilterWidget } from '../components/BrushFilterWidgets';

/** A filter widget with no message of its own, placed in the transcript by
 *  position: it renders just before the first shown message at index >= `at`. */
interface Interjection {
  at: number;
  key: string;
  node: ReactNode;
}

/**
 * Filter widgets that aren't a shown message, in transcript order.
 *
 * A brush filter sits where it was made: `brushAnchors` holds the message count
 * at the time, so it goes before the message at that index (clamped, since a
 * retry can trim the transcript). A `FilterData` filter from a hidden message
 * keeps its message's position, just after it (`+ 0.5`), which puts all of
 * them above the shown messages.
 */
export function filterInterjections(
  messages: Message[],
  hiddenCount: number,
  brushes: BrushFilter[],
  brushAnchors: Record<string, number>,
): Interjection[] {
  const hidden = messages.slice(0, hiddenCount).flatMap((message, messageIndex) =>
    extractAllFilterSpecsFromMessage(message).map(({ toolCallIndex }) => ({
      at: messageIndex + 0.5,
      key: `hidden-filter-${messageIndex}-${toolCallIndex}`,
      node: (
        <HiddenFilterWidget
          message={message}
          messageIndex={messageIndex}
          toolCallIndex={toolCallIndex}
        />
      ),
    })),
  );
  const brushWidgets = brushes.map((brush) => ({
    at: Math.min(brushAnchors[brush.id] ?? messages.length, messages.length),
    key: `brush-${brush.id}`,
    node: <BrushFilterWidget brush={brush} />,
  }));
  // Stable, so brushes made between the same two messages keep their order.
  return [...hidden, ...brushWidgets].sort((a, b) => a.at - b.at);
}
