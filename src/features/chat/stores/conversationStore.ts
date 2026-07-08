import { createStore } from 'zustand/vanilla';
import { generateEventId } from '@/lib/utils';
import type { Usage } from '../api/completions';
import type { Arguments, Message } from '@/types/messages';
import { EMPTY_USAGE, type SessionUsage } from '@/types/usage';

export type { SessionUsage } from '@/types/usage';

export interface ConversationState {
  messages: Message[];
  /** Accumulated token usage since the conversation began. */
  sessionUsage: SessionUsage;
  /** Add one response's token usage to the running total. */
  addUsage: (usage: Usage) => void;
  /** Replace the running total — used to restore it on session import. */
  setSessionUsage: (usage: SessionUsage) => void;
  /**
   * Stable per-conversation ID, sent to the server as `X-Conversation-Id`
   * and used to group a turn's LLM calls into one trace/session. A fresh id
   * is minted whenever a genuinely different conversation begins
   * (`newConversation`, or `loadConversation` without `keepId`).
   */
  conversationId: string;
  addMessage: (message: Message) => void;
  newConversation: () => void;
  getMessagesFormattedForLLM: () => Message[];
  /**
   * Replace the message list. By default this is treated as switching to a
   * different conversation and mints a new `conversationId`; pass
   * `{ keepId: true }` to keep the current id when only editing the active
   * thread in place (e.g. a retry trimming its trailing assistant message).
   */
  loadConversation: (messages: Message[], options?: { keepId?: boolean }) => void;
  exportConversation: () => string;
}

export function createConversationStore() {
  return createStore<ConversationState>()((set, get) => ({
    messages: [],

    conversationId: generateEventId(),

    sessionUsage: EMPTY_USAGE,

    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

    addUsage: (usage) =>
      set((state) => ({
        sessionUsage: {
          promptTokens: state.sessionUsage.promptTokens + usage.promptTokens,
          completionTokens: state.sessionUsage.completionTokens + usage.completionTokens,
          totalTokens: state.sessionUsage.totalTokens + usage.totalTokens,
          cachedPromptTokens: state.sessionUsage.cachedPromptTokens + usage.cachedPromptTokens,
          reasoningTokens: state.sessionUsage.reasoningTokens + usage.reasoningTokens,
          requests: state.sessionUsage.requests + 1,
          lastModel: usage.model ?? state.sessionUsage.lastModel,
        },
      })),

    setSessionUsage: (usage) => set({ sessionUsage: usage }),

    newConversation: () =>
      set({ messages: [], conversationId: generateEventId(), sessionUsage: EMPTY_USAGE }),

    loadConversation: (messages, options) =>
      set(options?.keepId ? { messages } : { messages, conversationId: generateEventId() }),

    exportConversation: () => JSON.stringify(get().messages, null, 2),

    getMessagesFormattedForLLM: () => {
      return get().messages.map((message) => {
        if (!message.tool_calls) return message;
        return {
          ...message,
          tool_calls: message.tool_calls.map((toolCall) => ({
            // The LLM wire format wants `arguments` as a JSON string, not an
            // object. We widen here through `unknown` because the Message
            // type models the parsed shape that the rest of the app sees.
            function: {
              name: toolCall.function.name,
              arguments: JSON.stringify(toolCall.function.arguments) as unknown as Arguments,
            },
          })),
        };
      });
    },
  }));
}
