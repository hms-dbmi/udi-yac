import { describe, it, expect } from 'vitest';
import { createConversationStore } from './conversationStore';
import type { Message } from '@/types/messages';

function msg(partial: Partial<Message> = {}): Message {
  return { role: 'user', content: '', ...partial };
}

describe('conversationStore', () => {
  it('starts with no messages', () => {
    const store = createConversationStore();
    expect(store.getState().messages).toEqual([]);
  });

  it('addMessage appends in order', () => {
    const store = createConversationStore();
    store.getState().addMessage(msg({ content: 'hello' }));
    store.getState().addMessage(msg({ role: 'assistant', content: 'hi' }));
    expect(store.getState().messages.map((m) => m.content)).toEqual(['hello', 'hi']);
  });

  it('newConversation clears the message list', () => {
    const store = createConversationStore();
    store.getState().addMessage(msg({ content: 'hello' }));
    store.getState().newConversation();
    expect(store.getState().messages).toEqual([]);
  });

  it('loadConversation replaces the message list', () => {
    const store = createConversationStore();
    store.getState().addMessage(msg({ content: 'existing' }));
    const loaded: Message[] = [msg({ content: 'a' }), msg({ content: 'b' })];
    store.getState().loadConversation(loaded);
    expect(store.getState().messages).toEqual(loaded);
  });

  it('starts with a non-empty conversationId', () => {
    const store = createConversationStore();
    expect(store.getState().conversationId).toBeTruthy();
  });

  it('newConversation mints a fresh conversationId', () => {
    const store = createConversationStore();
    const before = store.getState().conversationId;
    store.getState().newConversation();
    expect(store.getState().conversationId).not.toBe(before);
  });

  it('loadConversation mints a fresh conversationId by default', () => {
    const store = createConversationStore();
    const before = store.getState().conversationId;
    store.getState().loadConversation([msg({ content: 'a' })]);
    expect(store.getState().conversationId).not.toBe(before);
  });

  it('loadConversation keeps the conversationId when keepId is set', () => {
    const store = createConversationStore();
    const before = store.getState().conversationId;
    store.getState().loadConversation([msg({ content: 'a' })], { keepId: true });
    expect(store.getState().conversationId).toBe(before);
  });

  it('exportConversation round-trips through JSON', () => {
    const store = createConversationStore();
    const m = msg({ content: 'hi' });
    store.getState().addMessage(m);
    const serialized = store.getState().exportConversation();
    expect(JSON.parse(serialized)).toEqual([m]);
  });

  it('getMessagesFormattedForLLM stringifies tool_call arguments and preserves other messages', () => {
    const store = createConversationStore();
    const plain = msg({ content: 'hello' });
    const withToolCall = msg({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          function: {
            name: 'RenderVisualization',
            arguments: { spec: '{"source":{"name":"donors","source":"donors.csv"}}' },
          },
        },
      ],
    });
    store.getState().addMessage(plain);
    store.getState().addMessage(withToolCall);

    const formatted = store.getState().getMessagesFormattedForLLM();
    expect(formatted[0]).toBe(plain); // untouched when no tool_calls
    expect(formatted[1].tool_calls?.[0].function.arguments).toBe(
      JSON.stringify(withToolCall.tool_calls![0].function.arguments),
    );
    // Original state should not have been mutated.
    expect(typeof store.getState().messages[1].tool_calls![0].function.arguments).toBe('object');
  });
});
