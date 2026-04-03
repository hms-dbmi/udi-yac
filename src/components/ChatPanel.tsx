import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RotateCcw, KeyRound } from 'lucide-react';
import { ChatInput } from './ChatInput';
import { ApiKeyInput } from './ApiKeyInput';
import { MessageList } from './MessageList';
import { useChatApi } from '@/hooks/useChatApi';
import { useConversationStore, useDashboardStore, useSelectionsStore } from '@/stores/UDIChatContext';
import type { QueryConfig } from '@/api/completions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ChatPanelProps {
  config: QueryConfig;
  needsApiKey: boolean;
  hasApiKey: boolean;
  onSetApiKey: (key: string) => void;
  onClearApiKey: () => void;
}

export function ChatPanel({ config, needsApiKey, hasApiKey, onSetApiKey, onClearApiKey }: ChatPanelProps) {
  const { sendMessage, isLoading, error } = useChatApi(config);
  const conversationStore = useConversationStore();
  const dashboardStore = useDashboardStore();
  const selectionsStore = useSelectionsStore();

  const handleReset = useCallback(() => {
    conversationStore.getState().newConversation();
    dashboardStore.getState().clearAllVisualizations();
    selectionsStore.getState().clearSelections();
  }, [conversationStore, dashboardStore, selectionsStore]);

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      sendMessage(suggestion);
    },
    [sendMessage],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">Chat</h2>
        <div className="flex items-center gap-1">
          {hasApiKey && (
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClearApiKey} />}
              >
                <KeyRound className="h-3.5 w-3.5 text-green-600" />
              </TooltipTrigger>
              <TooltipContent>API key set — click to clear</TooltipContent>
            </Tooltip>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Separator />

      {/* Messages */}
      <MessageList isLoading={isLoading} onSelectSuggestion={handleSuggestion} />

      {/* Error */}
      {error && (
        <div className="px-3 py-1">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Input area: either API key prompt or chat input */}
      {needsApiKey ? (
        <ApiKeyInput onSubmit={onSetApiKey} />
      ) : (
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      )}
    </div>
  );
}
