import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useDataPackage, useGlobalStore } from '@/app/UDIChatContext';
import { ChatInput } from './ChatInput';
import { ApiKeyInput } from './ApiKeyInput';
import { MessageList } from './MessageList';
import { ChatHeaderBar } from './ChatHeaderBar';
import { DebugToggleSection } from './DebugToggleSection';
import { ClosedVisualizationsPanel } from './ClosedVisualizationsPanel';
import { InlineExamplePrompts } from './InlineExamplePrompts';
import { useChatApi } from '../hooks/useChatApi';
import { useResetHandlers } from '../hooks/useResetHandlers';
import type { QueryConfig } from '../api/completions';

interface ChatPanelProps {
  config: QueryConfig;
  needsApiKey: boolean;
  hasApiKey: boolean;
  userKeyQuotaExceeded: boolean;
  pendingQuotaRetry: boolean;
  onSetApiKey: (key: string) => void;
  onClearApiKey: () => void;
  onQuotaRebuff: (hadUserKey: boolean) => void;
  onNormalResponse: () => void;
  onConsumePendingRetry: () => void;
  showDrawerToggle?: boolean;
  drawerOpen?: boolean;
  onToggleDrawer?: () => void;
}

export function ChatPanel({
  config,
  needsApiKey,
  hasApiKey,
  userKeyQuotaExceeded,
  pendingQuotaRetry,
  onSetApiKey,
  onClearApiKey,
  onQuotaRebuff,
  onNormalResponse,
  onConsumePendingRetry,
  showDrawerToggle,
  onToggleDrawer,
}: ChatPanelProps) {
  const {
    sendMessage,
    retryLastUserMessage,
    flushQueuedMessage,
    cancelQueuedMessage,
    isLoading,
    error,
  } = useChatApi(config, {
    onQuotaRebuff,
    onNormalResponse,
  });
  const globalStore = useGlobalStore();
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  const dataReady = loadingPhase === 'ready';
  const { handleReset } = useResetHandlers();
  const [showSystemPrompts, setShowSystemPrompts] = useState(false);

  // Single entry point for every send path (ChatInput, example prompts in
  // ChatHeaderBar, suggested follow-ups in MessageList). If the data package
  // isn't loaded yet the LLM can't inspect data domains, so `sendMessage`
  // queues the request (showing the message + spinner) and the effect below
  // fires it once domains are ready.
  const handleSend = useCallback(
    (text: string) => {
      if (text.trim() === '!/admin') {
        globalStore.getState().toggleDebugMode();
        return;
      }
      sendMessage(text);
    },
    [sendMessage, globalStore],
  );

  // Flush a message queued during data load once domains are ready, or cancel
  // it if loading failed (so it can't spin forever). Both calls no-op when
  // nothing is queued.
  useEffect(() => {
    if (loadingPhase === 'ready') flushQueuedMessage();
    else if (loadingPhase === 'error')
      cancelQueuedMessage('Data failed to load — please try again.');
  }, [loadingPhase, flushQueuedMessage, cancelQueuedMessage]);

  // Auto-retry the last user turn after the user enters a key in response
  // to a quota rebuff. The parent sets `pendingQuotaRetry` alongside the
  // new key, so by the time this effect runs the new key has already
  // propagated into `config` (and thus into `retryLastUserMessage`'s
  // closure). Consume the flag immediately so this only fires once.
  useEffect(() => {
    if (!pendingQuotaRetry) return;
    if (!dataReady) return;
    onConsumePendingRetry();
    retryLastUserMessage();
  }, [pendingQuotaRetry, dataReady, onConsumePendingRetry, retryLastUserMessage]);

  return (
    <div className="flex flex-col h-full">
      <ChatHeaderBar
        config={config}
        hasApiKey={hasApiKey}
        onSetApiKey={onSetApiKey}
        onClearApiKey={onClearApiKey}
        showDrawerToggle={showDrawerToggle}
        onToggleDrawer={onToggleDrawer}
        onReset={handleReset}
        onExampleClick={handleSend}
        isLoading={isLoading}
      />
      <Separator />
      <DebugToggleSection
        showSystemPrompts={showSystemPrompts}
        onShowSystemPromptsChange={setShowSystemPrompts}
      />
      <InlineExamplePrompts
        apiBaseUrl={config.apiBaseUrl}
        onExampleClick={handleSend}
        isLoading={isLoading}
      />
      <MessageList
        isLoading={isLoading}
        showSystemPrompts={showSystemPrompts}
        onSelectSuggestion={handleSend}
      />
      {error && (
        <div className="px-3 py-1">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
      {!dataReady && (
        <div className="px-3 py-1 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading fields...</p>
        </div>
      )}
      {userKeyQuotaExceeded && (
        <div className="px-3 py-1">
          <p className="text-xs text-destructive">
            Your OpenAI key appears to be over quota —{' '}
            <button
              type="button"
              onClick={onClearApiKey}
              className="underline underline-offset-2 hover:text-destructive/80"
            >
              clear it and enter a new one
            </button>
            .
          </p>
        </div>
      )}
      <ClosedVisualizationsPanel />
      {needsApiKey ? (
        <ApiKeyInput onSubmit={onSetApiKey} />
      ) : (
        <ChatInput onSend={handleSend} disabled={isLoading} />
      )}
    </div>
  );
}
