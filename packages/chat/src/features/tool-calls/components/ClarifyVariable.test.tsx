/**
 * @vitest-environment jsdom
 *
 * The agent's ClarifyVariable, as the chat shows it: one question at a time,
 * gone once the user has replied.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UDIChatProvider, useConversationStore } from '@/app/UDIChatContext';
import { ToolCallRenderer } from './ToolCallRenderer';

const clarify = {
  name: 'ClarifyVariable',
  arguments: {
    message: 'Which age and weight?',
    ambiguous_variables: [
      {
        query_term: 'age',
        candidates: [
          { field_name: 'age_value', entity: 'donors' },
          { field_name: 'gestational_age_value', entity: 'donors' },
        ],
      },
      { query_term: 'weight', candidates: [{ field_name: 'weight_value', entity: 'donors' }] },
    ],
  },
};

function Probe({ onStore }: { onStore: (s: ReturnType<typeof useConversationStore>) => void }) {
  onStore(useConversationStore());
  return null;
}

describe('ClarifyVariable in the chat', () => {
  it('asks one question at a time and collapses once answered', async () => {
    let conversation!: ReturnType<typeof useConversationStore>;
    const onSelectSuggestion = vi.fn();
    render(
      <UDIChatProvider>
        <Probe onStore={(s) => (conversation = s)} />
        <ToolCallRenderer
          toolCall={clarify}
          messageIndex={0}
          onSelectSuggestion={onSelectSuggestion}
        />
      </UDIChatProvider>,
    );

    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.queryByText('weight_value')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^1 age_value/ }));

    expect(screen.getByText('2 of 2')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onSelectSuggestion).toHaveBeenCalledExactlyOnceWith(
      'age: age_value (donors)\nweight: no preference',
    );

    act(() => {
      conversation.getState().addMessage({ role: 'assistant', content: '' });
      conversation.getState().addMessage({ role: 'user', content: 'age: age_value (donors)' });
    });
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(screen.getByText('Which age and weight?')).toBeTruthy();
  });
});
