import type { Message } from '@/types/messages';
import { ToolCallRenderer } from '@/features/tool-calls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDashboard } from '@/app/UDIChatContext';
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
  const pinKey = useDashboard((s) => s.pinKey);
  const isPinned = useDashboard((s) => s.isPinned);
  const isUser = message.role === 'user';
  const toolCalls = message.tool_calls ?? [];

  return (
    <div data-message className={cn('flex scroll-mt-6', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {/* Message text */}
        {message.content && <p className="text-sm whitespace-pre-wrap">{message.content}</p>}

        {/* Tool calls */}
        {toolCalls.length === 1 && (
          <ToolCallRenderer
            toolCall={toolCalls[0].function}
            isPinned={isPinned(pinKey(messageIndex, 0))}
            onSelectSuggestion={onSelectSuggestion}
            message={message}
            messageIndex={messageIndex}
            toolCallIndex={0}
          />
        )}

        {toolCalls.length > 1 && (
          <Tabs defaultValue="0" className="mt-1">
            <TabsList className="h-7">
              {toolCalls.map((tc, i) => (
                <TabsTrigger key={i} value={String(i)} className="text-xs px-2 py-0.5">
                  {TOOL_CALL_LABELS[tc.function.name] ?? tc.function.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {toolCalls.map((tc, i) => (
              <TabsContent key={i} value={String(i)}>
                <ToolCallRenderer
                  toolCall={tc.function}
                  isPinned={isPinned(pinKey(messageIndex, i))}
                  onSelectSuggestion={onSelectSuggestion}
                  message={message}
                  messageIndex={messageIndex}
                  toolCallIndex={i}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}
