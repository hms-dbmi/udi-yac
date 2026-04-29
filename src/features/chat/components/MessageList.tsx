import { Fragment } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useConversation, useGlobal } from '@/app/UDIChatContext';
import { MessageBubble } from './MessageBubble';
import { useMessageListScroll } from '../hooks/useMessageListScroll';

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
  const { contentRef, firstUnreadIndex, scrollToBottom } = useMessageListScroll(messages);

  const displayed = messages.filter((m) => m.role !== 'system' || (debugMode && showSystemPrompts));

  return (
    <div className="relative flex-1 min-h-0">
      <ScrollArea className="h-full px-3">
        <div ref={contentRef} className="flex flex-col gap-3 py-3">
          {displayed.map((msg) => {
            const realIndex = messages.indexOf(msg);
            const showDivider = firstUnreadIndex !== null && realIndex === firstUnreadIndex;
            return (
              <Fragment key={realIndex}>
                {showDivider && <NewMessageDivider />}
                <MessageBubble
                  message={msg}
                  messageIndex={realIndex}
                  onSelectSuggestion={onSelectSuggestion}
                />
              </Fragment>
            );
          })}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      {firstUnreadIndex !== null && (
        <Button
          size="sm"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
        >
          <ArrowDown />
          new message
        </Button>
      )}
    </div>
  );
}

function NewMessageDivider() {
  return (
    <div className="flex items-center gap-2" role="separator" aria-label="new messages below">
      <div className="flex-1 h-px bg-primary" />
      <span className="text-xs font-medium text-primary">new message</span>
      <div className="flex-1 h-px bg-primary" />
    </div>
  );
}
