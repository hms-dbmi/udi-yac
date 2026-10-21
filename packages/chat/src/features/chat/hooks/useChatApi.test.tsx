/**
 * @vitest-environment jsdom
 *
 * When the user asks to report an issue, the agent's live offer opens the
 * report form on its own; an unprompted offer leaves it to the user.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { UDIChatProvider, useConversationStore, useGlobalStore } from '@/app/UDIChatContext';
import { useChatApi } from './useChatApi';

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

const offer = {
  name: 'OfferIssueReport',
  arguments: { message: 'Report this?', summary: 'Ages look off.', user_requested: false },
};

describe('useChatApi issue report offer', () => {
  it.each([
    [true, true],
    [false, false],
  ])('a live offer with user_requested=%s opens the form: %s', async (userRequested, opens) => {
    stubFetch(
      json([{ ...offer, arguments: { ...offer.arguments, user_requested: userRequested } }]),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <UDIChatProvider>{children}</UDIChatProvider>
    );
    const { result } = renderHook(
      () => ({
        api: useChatApi({ apiBaseUrl: '/api/yac', issueReporting: true }),
        conversation: useConversationStore(),
        global: useGlobalStore(),
      }),
      { wrapper },
    );

    result.current.conversation
      .getState()
      .addMessage({ role: 'user', content: 'I want to report a bug' });
    await act(() => result.current.api.retryLastUserMessage());

    expect(result.current.global.getState().issueReport.open).toBe(opens);
  });
});
