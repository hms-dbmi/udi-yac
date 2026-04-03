import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConversation } from '@/stores/UDIChatContext';
import { MessageBubble } from './MessageBubble';
import { Loader2 } from 'lucide-react';

interface MessageListProps {
  isLoading: boolean;
  onSelectSuggestion?: (suggestion: string) => void;
}

export function MessageList({ isLoading, onSelectSuggestion }: MessageListProps) {
  const messages = useConversation((s) => s.messages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  const displayed = messages.filter((m) => m.role !== 'system');

  return (
    <ScrollArea className="flex-1 px-3">
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
