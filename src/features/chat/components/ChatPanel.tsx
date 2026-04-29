import { useCallback, useEffect, useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { useDataPackage, useGlobalStore } from '@/app/UDIChatContext';
import { ChatInput } from './ChatInput';
import { ApiKeyInput } from './ApiKeyInput';
import { MessageList } from './MessageList';
import { ChatHeaderBar } from './ChatHeaderBar';
import { DebugToggleSection } from './DebugToggleSection';
import { ClosedVisualizationsPanel } from './ClosedVisualizationsPanel';
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
  const { sendMessage, retryLastUserMessage, isLoading, error } = useChatApi(config, {
    onQuotaRebuff,
    onNormalResponse,
  });
  const globalStore = useGlobalStore();
  const dataReady = useDataPackage((s) => s.loadingPhase === 'ready');
  const { handleReset } = useResetHandlers();
  const [showSystemPrompts, setShowSystemPrompts] = useState(false);

  // Single guarded entry point for every send path (ChatInput, example
  // prompts in ChatHeaderBar, suggested follow-ups in MessageList). Until
  // the data package is fully loaded, the LLM can't inspect data domains
  // or dispatch visualization tool calls, so we block the send entirely
  // instead of letting a half-initialized request go through.
  const handleSend = useCallback(
    (text: string) => {
      if (text.trim() === '!/admin') {
        globalStore.getState().toggleDebugMode();
        return;
      }
      if (!dataReady) return;
      sendMessage(text);
    },
    [sendMessage, globalStore, dataReady],
  );

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
        <ChatInput
          onSend={handleSend}
          disabled={isLoading || !dataReady}
          placeholder={!dataReady ? 'Loading data...' : undefined}
        />
      )}
    </div>
  );
}
