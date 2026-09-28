import { Fragment } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useConversation, useGlobal } from '@/app/UDIChatContext';
import { MessageBubble } from './MessageBubble';
import { BrushFilterWidgets } from './BrushFilterWidgets';
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
    <div className="udi:relative udi:flex-1 udi:min-h-0">
      <ScrollArea className="udi:h-full udi:px-3">
        {/* min-h-full + mt-auto anchors messages to the bottom so they fill
            upward; mt-auto collapses to 0 once content overflows, leaving
            normal top-to-bottom scrolling. (justify-end would clip the top.) */}
        <div className="udi:flex udi:min-h-full udi:flex-col">
          <div ref={contentRef} className="udi:mt-auto udi:flex udi:flex-col udi:gap-3 udi:py-3">
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
              <div className="udi:flex udi:justify-start">
                <div className="udi:bg-muted udi:rounded-lg udi:px-4 udi:py-3">
                  <Loader2 className="udi:h-4 udi:w-4 udi:animate-spin udi:text-muted-foreground" />
                </div>
              </div>
            )}
            <BrushFilterWidgets />
          </div>
        </div>
      </ScrollArea>
      {firstUnreadIndex !== null && (
        <Button
          size="sm"
          onClick={scrollToBottom}
          className="udi:absolute udi:bottom-3 udi:left-1/2 udi:-translate-x-1/2 udi:rounded-full udi:shadow-md"
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
    <div
      className="udi:flex udi:items-center udi:gap-2"
      role="separator"
      aria-label="new messages below"
    >
      <div className="udi:flex-1 udi:h-px udi:bg-primary" />
      <span className="udi:text-xs udi:font-medium udi:text-primary">new message</span>
      <div className="udi:flex-1 udi:h-px udi:bg-primary" />
    </div>
  );
}
