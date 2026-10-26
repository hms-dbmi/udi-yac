/**
 * @vitest-environment jsdom
 *
 * The agent's OfferIssueReport, as the chat shows it.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssueReportingProvider, UDIChatProvider, useGlobalStore } from '@/app/UDIChatContext';
import { ToolCallRenderer } from './ToolCallRenderer';

const offer = {
  name: 'OfferIssueReport',
  arguments: { message: 'Report this?', summary: 'Ages look off.', user_requested: false },
};

function Probe({ onStores }: { onStores: (s: ReturnType<typeof useGlobalStore>) => void }) {
  onStores(useGlobalStore());
  return null;
}

describe('OfferIssueReport in the chat', () => {
  it('opens the report form pre-filled with the agent summary', async () => {
    let globalStore!: ReturnType<typeof useGlobalStore>;
    render(
      <UDIChatProvider>
        <IssueReportingProvider value>
          <Probe onStores={(s) => (globalStore = s)} />
          <ToolCallRenderer toolCall={offer} />
        </IssueReportingProvider>
      </UDIChatProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Report issue' }));

    expect(globalStore.getState().issueReport).toEqual({
      open: true,
      draft: 'Ages look off.',
      source: 'chat',
    });
  });

  it('shows only the message when issue reporting is off', () => {
    render(
      <UDIChatProvider>
        <ToolCallRenderer toolCall={offer} />
      </UDIChatProvider>,
    );
    expect(screen.getByText('Report this?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Report issue' })).toBeNull();
  });
});
