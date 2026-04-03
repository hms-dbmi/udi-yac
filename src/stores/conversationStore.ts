import { createStore } from 'zustand/vanilla';
import type { Message } from '@/types/messages';

export interface ConversationState {
  messages: Message[];
  addMessage: (message: Message) => void;
  newConversation: () => void;
  getMessagesFormattedForLLM: () => Message[];
}

export function createConversationStore() {
  return createStore<ConversationState>()((set, get) => ({
    messages: [],

    addMessage: (message) =>
      set((state) => ({ messages: [...state.messages, message] })),

    newConversation: () => set({ messages: [] }),

    getMessagesFormattedForLLM: () => {
      return get().messages.map((message) => {
        if (!message.tool_calls) return message;
        return {
          ...message,
          tool_calls: message.tool_calls.map((toolCall) => ({
            function: {
              name: toolCall.function.name,
              arguments: JSON.stringify(toolCall.function.arguments) as any,
            },
          })),
        };
      });
    },
  }));
}
