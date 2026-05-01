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
  const isUser = message.role === 'user';
  const toolCalls = message.tool_calls ?? [];

  return (
    <div data-message className={cn('flex scroll-mt-6', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] min-w-0 rounded-lg px-3 py-2 wrap-break-word',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
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
          <Accordion defaultValue={[0]} className="mt-1">
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
