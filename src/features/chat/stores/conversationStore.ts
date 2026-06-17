import { createStore } from 'zustand/vanilla';
import { generateEventId } from '@/lib/utils';
import type { Arguments, Message } from '@/types/messages';

export interface ConversationState {
  messages: Message[];
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

    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

    newConversation: () => set({ messages: [], conversationId: generateEventId() }),

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
