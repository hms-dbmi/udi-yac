import { Crosshair } from 'lucide-react';
import type { Message } from '@/types/messages';
import { ToolCallRenderer } from '@/features/tool-calls';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useDashboard, useDashboardStore } from '@/app/UDIChatContext';
import { MarkdownText } from '@/components/MarkdownText';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useJumpTarget } from '@/hooks/useJumpTarget';
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
  // Subscribe to the map (not the `isActive` selector, whose function identity
  // never changes) so opening or closing a card re-renders this bubble — the
  // jump buttons below only make sense while the card is on the dashboard.
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  const isActive = (key: string) => activeVisualizations.has(key);
  const dashboardStore = useDashboardStore();
  // Highlight this bubble while a dashboard card it produced is hovered. The
  // hovered value is a vizKey `${messageIndex}-${toolCallIndex}`, and one
  // message can own several cards (one per RenderVisualization tool call), so
  // match on the message-index prefix. The `-` delimiter keeps e.g. message 1
  // from matching message 12's cards.
  const hoveredViz = useDashboard((s) => s.hoveredVisualizationIndex);
  const isVizHovered = hoveredViz != null && hoveredViz.startsWith(`${messageIndex}-`);
  const isUser = message.role === 'user';
  const toolCalls = message.tool_calls ?? [];

  // The chat→card hover is per-visualization: a single-tool-call message links
  // its whole bubble to its one card; a multi-tool-call message links each
  // accordion item to its own card (below), so hovering an item highlights
  // exactly that visualization.
  const singleVizKey = toolCalls.length === 1 ? vizKey(messageIndex, 0) : null;
  const setChatHover = (key: string | null) =>
    dashboardStore.getState().setHoveredMessageVizKey(key);
  const jumpToViz = (key: string) => dashboardStore.getState().requestJumpToVisualization(key);

  // "Show message in chat" pressed on one of the cards this message produced —
  // any of them reveals the same bubble, so match on the message-index prefix.
  const jump = useDashboard((s) => s.jumpToMessage);
  const isJumpTarget = jump != null && jump.key.startsWith(`${messageIndex}-`);
  const { ref: bubbleRef, flashing } = useJumpTarget<HTMLDivElement>(
    isJumpTarget ? jump.nonce : null,
  );

  // Only offer the jump when the card is actually on the dashboard: a closed
  // visualization has nothing to scroll to.
  const showSingleJump = singleVizKey != null && isActive(singleVizKey);

  return (
    <div
      ref={bubbleRef}
      data-message
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
      // Single-viz messages link the whole bubble to their one card. Multi-viz
      // messages link per accordion item instead (see below), so no bubble-level
      // handler here.
      onMouseEnter={singleVizKey ? () => setChatHover(singleVizKey) : undefined}
      onMouseLeave={singleVizKey ? () => setChatHover(null) : undefined}
    >
      <div
        className={cn(
          'group/bubble relative max-w-[85%] min-w-0 rounded-lg px-3 py-2 wrap-break-word transition-shadow',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
          // ring-inset so the outline isn't clipped by the scroll viewport's
          // overflow-x-hidden on left-aligned (assistant) bubbles.
          (isVizHovered || flashing) && 'ring-2 ring-inset ring-primary/50',
          // Room for the corner jump button so it doesn't sit on the text.
          showSingleJump && 'pr-8',
        )}
      >
        {/* Jump to this message's visualization. Corner-anchored and revealed
            on hover (or keyboard focus) so it stays out of the way of the
            message text. Multi-viz messages get one button per accordion item
            instead, since the bubble maps to several cards. */}
        {showSingleJump && (
          <JumpToVizButton
            className="absolute top-1 right-1 opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-visible:opacity-100"
            onClick={() => jumpToViz(singleVizKey)}
          />
        )}
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
            {toolCalls.map((tc, i) => {
              const itemKey = vizKey(messageIndex, i);
              return (
                <AccordionItem
                  key={i}
                  value={i}
                  // Hovering an item highlights its card; the item tints when
                  // that card is hovered (hoveredViz is set by the card).
                  onMouseEnter={() => setChatHover(itemKey)}
                  onMouseLeave={() => setChatHover(null)}
                  className={cn('transition-colors', hoveredViz === itemKey && 'bg-primary/10')}
                >
                  <div className="flex items-center gap-0.5">
                    <AccordionTrigger className="text-xs">
                      {TOOL_CALL_LABELS[tc.function.name] ?? tc.function.name}
                    </AccordionTrigger>
                    {isActive(itemKey) && <JumpToVizButton onClick={() => jumpToViz(itemKey)} />}
                  </div>
                  <AccordionContent>
                    <ToolCallRenderer
                      toolCall={tc.function}
                      isActive={isActive(itemKey)}
                      onSelectSuggestion={onSelectSuggestion}
                      message={message}
                      messageIndex={messageIndex}
                      toolCallIndex={i}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </div>
  );
}

/** Shared "show visualization in dashboard" affordance — the chat-side twin of
 *  the dashboard card's "show message in chat" toolbar button. */
function JumpToVizButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6 shrink-0', className)}
            aria-label="Show visualization in dashboard"
            onClick={onClick}
          />
        }
      >
        <Crosshair className="h-3 w-3" />
      </TooltipTrigger>
      <TooltipContent>Show visualization in dashboard</TooltipContent>
    </Tooltip>
  );
}
