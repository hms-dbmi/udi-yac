import { useCallback, useRef, useState } from 'react';
import { queryLLM, type QueryConfig, type ToolCallResponse } from '../api/completions';
import { useConversationStore, useDataPackageStore, useTracker } from '@/app/UDIChatContext';
import { generateEventId } from '@/lib/utils';
import type { Message } from '@/types/messages';

interface UseChatApiOptions {
  /**
   * Fired when the latest assistant response is a budget-exceeded rebuff
   * (server returns a `Rebuff` tool_call with `arguments.reason ===
   * "budget_exceeded"`). `hadUserKey` is true iff `config.openAiKey` was
   * present on the request, which lets the parent distinguish the
   * server-key-exhausted case from user-key-exhausted.
   */
  onQuotaRebuff?: (hadUserKey: boolean) => void;
  /**
   * Fired on any successful response that is NOT a budget-exceeded rebuff,
   * so the parent can clear a stale quota flag — e.g. after an admin
   * refills the server key, the prompt should go away on its own.
   */
  onNormalResponse?: () => void;
}

function isBudgetExceededRebuff(tc: ToolCallResponse): boolean {
  if (tc.name !== 'Rebuff') return false;
  const reason = (tc.arguments as { reason?: unknown }).reason;
  return reason === 'budget_exceeded';
}

export function useChatApi(config: QueryConfig, options: UseChatApiOptions = {}) {
  const { onQuotaRebuff, onNormalResponse } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationStore = useConversationStore();
  const dataPackageStore = useDataPackageStore();
  const trackEvent = useTracker();
  // The most recently minted turnId — reused by `retryLastUserMessage` so
  // a retry's `response_received` pairs back to the originating
  // `message_sent` instead of orphaning. Generated per-send in
  // `sendMessage`, consumed by `runCompletion` for the response/rebuff/
  // request_failed events.
  const turnIdRef = useRef<string | null>(null);
  // Holds the turnId of a message the user submitted while the data package
  // was still loading. The user message + spinner show immediately; the
  // backend request is deferred until domains are ready (flushQueuedMessage,
  // driven by ChatPanel once loadingPhase flips to 'ready').
  const queuedTurnIdRef = useRef<string | null>(null);

  const runCompletion = useCallback(
    async (messages: Message[], turnId: string) => {
      const dpState = dataPackageStore.getState();
      const hadUserKey = !!config.openAiKey;
      const startedAt = performance.now();

      setIsLoading(true);
      setError(null);

      try {
        const { toolCalls, usage } = await queryLLM(
          config,
          messages,
          dpState.dataPackageString,
          dpState.dataDomainsString,
          conversationStore.getState().conversationId,
        );

        conversationStore.getState().addUsage(usage);
        conversationStore.getState().addMessage({
          role: 'assistant',
          content: '',
          tool_calls: toolCalls.map((tc) => ({
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });

        const durationMs = Math.round(performance.now() - startedAt);
        const toolCallNames = toolCalls.map((tc) => tc.name);
        const rebuff = toolCalls.find((tc) => tc.name === 'Rebuff');
        trackEvent('response_received', {
          turnId,
          durationMs,
          toolCallNames,
          toolCallCount: toolCalls.length,
          hadUserKey,
          hasRebuff: !!rebuff,
        });
        if (rebuff) {
          const reason = (rebuff.arguments as { reason?: unknown }).reason;
          trackEvent('rebuff_received', {
            turnId,
            reason: typeof reason === 'string' ? reason : undefined,
            hadUserKey,
          });
        }

        if (toolCalls.some(isBudgetExceededRebuff)) {
          onQuotaRebuff?.(hadUserKey);
        } else {
          onNormalResponse?.();
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        trackEvent('request_failed', {
          turnId,
          durationMs: Math.round(performance.now() - startedAt),
          hadUserKey,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [config, conversationStore, dataPackageStore, onQuotaRebuff, onNormalResponse, trackEvent],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const turnId = generateEventId();
      turnIdRef.current = turnId;
      conversationStore.getState().addMessage({ role: 'user', content: text });
      trackEvent('message_sent', {
        turnId,
        charCount: text.length,
        conversationLength: conversationStore.getState().messages.length,
        hasUserApiKey: !!config.openAiKey,
      });
      // The LLM needs loaded data domains to answer. If they aren't ready yet,
      // queue the request: show the spinner now, fire the backend call once
      // ChatPanel flushes the queue on loadingPhase === 'ready'.
      if (dataPackageStore.getState().loadingPhase !== 'ready') {
        queuedTurnIdRef.current = turnId;
        setIsLoading(true);
        return;
      }
      await runCompletion(conversationStore.getState().messages, turnId);
    },
    [conversationStore, dataPackageStore, runCompletion, trackEvent, config.openAiKey],
  );

  /**
   * Fire a request that was queued while the data package was loading. Called
   * by ChatPanel once domains are ready. No-ops if nothing is queued. Guards
   * like `retryLastUserMessage`: if the trailing user turn is gone (e.g. the
   * conversation was reset while queued), just clear the spinner. Reuses the
   * queued turnId so `response_received` pairs back to the original
   * `message_sent`.
   */
  const flushQueuedMessage = useCallback(async () => {
    const turnId = queuedTurnIdRef.current;
    if (!turnId) return;
    queuedTurnIdRef.current = null;
    const messages = conversationStore.getState().messages;
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      setIsLoading(false);
      return;
    }
    await runCompletion(messages, turnId);
  }, [conversationStore, runCompletion]);

  /**
   * Drop a queued request and surface an error — used when the data package
   * fails to load, so the queued message doesn't spin forever.
   */
  const cancelQueuedMessage = useCallback((message: string) => {
    if (!queuedTurnIdRef.current) return;
    queuedTurnIdRef.current = null;
    setIsLoading(false);
    setError(message);
  }, []);

  /**
   * Re-run the last user turn. Used after the user enters their own API
   * key in response to a budget-exceeded rebuff: the key goes through
   * config on the next request, but there's no new user message to trigger
   * one. We drop any trailing assistant message (the rebuff itself) so the
   * conversation doesn't end up with two stacked assistant replies.
   *
   * Reuses the previous `turnId` so the retry's response pairs back to
   * the original `message_sent`. Falls back to a fresh id only in the
   * degenerate case where no send has ever happened (shouldn't occur in
   * practice — retry is always triggered by a prior quota rebuff).
   */
  const retryLastUserMessage = useCallback(async () => {
    const state = conversationStore.getState();
    const trimmed = [...state.messages];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].role !== 'user') {
      trimmed.pop();
    }
    if (trimmed.length === 0) return;
    const turnId = turnIdRef.current ?? generateEventId();
    turnIdRef.current = turnId;
    // Same conversation continuing — keep the id so the retry's trace stays
    // grouped with the original turn rather than starting a new session.
    state.loadConversation(trimmed, { keepId: true });
    await runCompletion(trimmed, turnId);
  }, [conversationStore, runCompletion]);

  return {
    sendMessage,
    retryLastUserMessage,
    flushQueuedMessage,
    cancelQueuedMessage,
    isLoading,
    error,
  };
}
