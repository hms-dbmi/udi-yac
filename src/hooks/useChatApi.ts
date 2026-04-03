import { useState, useCallback } from 'react';
import { queryLLM, type QueryConfig } from '@/api/completions';
import { useConversationStore, useDataPackageStore } from '@/stores/UDIChatContext';

export function useChatApi(config: QueryConfig) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationStore = useConversationStore();
  const dataPackageStore = useDataPackageStore();

  const sendMessage = useCallback(
    async (text: string) => {
      const convState = conversationStore.getState();
      const dpState = dataPackageStore.getState();

      // Add user message
      convState.addMessage({ role: 'user', content: text });

      setIsLoading(true);
      setError(null);

      try {
        const messages = conversationStore.getState().messages;
        const toolCalls = await queryLLM(
          config,
          messages,
          dpState.dataPackageString,
          dpState.dataDomainsString,
        );

        convState.addMessage({
          role: 'assistant',
          content: '',
          tool_calls: toolCalls.map((tc) => ({
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    },
    [config, conversationStore, dataPackageStore],
  );

  return { sendMessage, isLoading, error };
}
