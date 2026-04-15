import { createStore } from 'zustand/vanilla';
import type { Arguments, Message } from '@/types/messages';

export interface ConversationState {
  messages: Message[];
  addMessage: (message: Message) => void;
  newConversation: () => void;
  getMessagesFormattedForLLM: () => Message[];
  loadConversation: (messages: Message[]) => void;
  exportConversation: () => string;
}

export function createConversationStore() {
  return createStore<ConversationState>()((set, get) => ({
    messages: [],

    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

    newConversation: () => set({ messages: [] }),

    loadConversation: (messages) => set({ messages }),

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
