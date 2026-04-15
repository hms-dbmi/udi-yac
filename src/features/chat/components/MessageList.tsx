import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConversation, useGlobal } from '@/app/UDIChatContext';
import { MessageBubble } from './MessageBubble';
import { Loader2 } from 'lucide-react';

interface MessageListProps {
  isLoading: boolean;
  showSystemPrompts?: boolean;
  onSelectSuggestion?: (suggestion: string) => void;
}

export function MessageList({
  isLoading,
  showSystemPrompts,
  onSelectSuggestion,
}: MessageListProps) {
  const messages = useConversation((s) => s.messages);
  const debugMode = useGlobal((s) => s.debugMode);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  const displayed = messages.filter((m) => m.role !== 'system' || (debugMode && showSystemPrompts));

  return (
    <ScrollArea className="flex-1 min-h-0 px-3">
      <div className="flex flex-col gap-3 py-3">
        {displayed.map((msg) => {
          // Find the real index in messages (accounting for filtered system messages)
          const realIndex = messages.indexOf(msg);
          return (
            <MessageBubble
              key={realIndex}
              message={msg}
              messageIndex={realIndex}
              onSelectSuggestion={onSelectSuggestion}
            />
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
