import { useEffect, useRef } from 'react';
import type { Message } from '@/types/messages';
import { ToolCallRenderer } from '@/features/tool-calls';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useDashboard } from '@/app/UDIChatContext';
import { MarkdownText } from '@/components/MarkdownText';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  messageIndex: number;
  onSelectSuggestion?: (suggestion: string) => void;
}

const TOOL_CALL_LABELS: Record<string, string> = {
  RenderVisualization: 'Visualization',
  FreeTextExplain: 'Explanation',
  Rebuff: 'Notice',
  FilterData: 'Filter',
  ClarifyVariable: 'Clarify',
};

export function MessageBubble({ message, messageIndex, onSelectSuggestion }: MessageBubbleProps) {
  const vizKey = useDashboard((s) => s.vizKey);
  const isActive = useDashboard((s) => s.isActive);
  // Highlight this bubble while a dashboard card it produced is hovered. The
  // hovered value is a vizKey `${messageIndex}-${toolCallIndex}`, and one
  // message can own several cards (one per RenderVisualization tool call), so
  // match on the message-index prefix. The `-` delimiter keeps e.g. message 1
  // from matching message 12's cards.
  const hoveredViz = useDashboard((s) => s.hoveredVisualizationIndex);
  const isVizHovered = hoveredViz != null && hoveredViz.startsWith(`${messageIndex}-`);
  const isUser = message.role === 'user';
  const toolCalls = message.tool_calls ?? [];

  // Scroll this message into view when a card it produced is hovered.
  // `block: 'nearest'` is a no-op when it's already visible, so it only nudges
  // the chat when the message is off-screen; `scroll-mt-6` keeps it off the top.
  const bubbleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isVizHovered) bubbleRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isVizHovered]);

  return (
    <div
      ref={bubbleRef}
      data-message
      className={cn('flex scroll-mt-6', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] min-w-0 rounded-lg px-3 py-2 wrap-break-word transition-shadow',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
          // ring-inset so the outline isn't clipped by the scroll viewport's
          // overflow-x-hidden on left-aligned (assistant) bubbles.
          isVizHovered && 'ring-2 ring-inset ring-primary/50',
        )}
      >
        {/* Message text */}
        {message.content && <MarkdownText>{message.content}</MarkdownText>}

        {/* Tool calls */}
        {toolCalls.length === 1 && (
          <ToolCallRenderer
            toolCall={toolCalls[0].function}
            isActive={isActive(vizKey(messageIndex, 0))}
            onSelectSuggestion={onSelectSuggestion}
            message={message}
            messageIndex={messageIndex}
            toolCallIndex={0}
          />
        )}

        {toolCalls.length > 1 && (
          <Accordion defaultValue={[0]} className="mt-1 min-w-64">
            {toolCalls.map((tc, i) => (
              <AccordionItem key={i} value={i}>
                <AccordionTrigger className="text-xs">
                  {TOOL_CALL_LABELS[tc.function.name] ?? tc.function.name}
                </AccordionTrigger>
                <AccordionContent>
                  <ToolCallRenderer
                    toolCall={tc.function}
                    isActive={isActive(vizKey(messageIndex, i))}
                    onSelectSuggestion={onSelectSuggestion}
                    message={message}
                    messageIndex={messageIndex}
                    toolCallIndex={i}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
