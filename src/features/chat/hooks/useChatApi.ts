import { useCallback, useState } from 'react';
import { queryLLM, type QueryConfig, type ToolCallResponse } from '../api/completions';
import { useConversationStore, useDataPackageStore } from '@/app/UDIChatContext';
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

  const runCompletion = useCallback(
    async (messages: Message[]) => {
      const dpState = dataPackageStore.getState();
      const hadUserKey = !!config.openAiKey;

      setIsLoading(true);
      setError(null);

      try {
        const toolCalls = await queryLLM(
          config,
          messages,
          dpState.dataPackageString,
          dpState.dataDomainsString,
        );

        conversationStore.getState().addMessage({
          role: 'assistant',
          content: '',
          tool_calls: toolCalls.map((tc) => ({
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });

        if (toolCalls.some(isBudgetExceededRebuff)) {
          onQuotaRebuff?.(hadUserKey);
        } else {
          onNormalResponse?.();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    },
    [config, conversationStore, dataPackageStore, onQuotaRebuff, onNormalResponse],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      conversationStore.getState().addMessage({ role: 'user', content: text });
      await runCompletion(conversationStore.getState().messages);
    },
    [conversationStore, runCompletion],
  );

  /**
   * Re-run the last user turn. Used after the user enters their own API
   * key in response to a budget-exceeded rebuff: the key goes through
   * config on the next request, but there's no new user message to trigger
   * one. We drop any trailing assistant message (the rebuff itself) so the
   * conversation doesn't end up with two stacked assistant replies.
   */
  const retryLastUserMessage = useCallback(async () => {
    const state = conversationStore.getState();
    const trimmed = [...state.messages];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].role !== 'user') {
      trimmed.pop();
    }
    if (trimmed.length === 0) return;
    state.loadConversation(trimmed);
    await runCompletion(trimmed);
  }, [conversationStore, runCompletion]);

  return { sendMessage, retryLastUserMessage, isLoading, error };
}
