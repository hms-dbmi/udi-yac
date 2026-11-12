/**
 * @vitest-environment jsdom
 *
 * When the user asks to report an issue, the agent's live offer opens the
 * report form on its own; an unprompted offer leaves it to the user.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  UDIChatProvider,
  useConversationStore,
  useDashboardStore,
  useGlobalStore,
  useMemoryBankStore,
} from '@/app/UDIChatContext';
import type { UDIGrammar } from 'udi-toolkit/react';
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

describe('useChatApi dashboard and reset actions', () => {
  const spec = { source: { name: 'd', source: 'd.csv' } } as unknown as UDIGrammar;

  async function respond(reply: unknown[]) {
    stubFetch(json(reply));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <UDIChatProvider>{children}</UDIChatProvider>
    );
    const { result } = renderHook(
      () => ({
        api: useChatApi({ apiBaseUrl: '/api/yac' }),
        conversation: useConversationStore(),
        dashboard: useDashboardStore(),
        memoryBank: useMemoryBankStore(),
        global: useGlobalStore(),
      }),
      { wrapper },
    );
    const { dashboard, memoryBank, conversation } = result.current;
    dashboard.getState().addActiveVisualization(0, 0, spec, '', null);
    dashboard.getState().addActiveVisualization(1, 0, spec, '', null);
    dashboard.getState().closeVisualization('1-0', memoryBank);
    conversation.getState().addMessage({ role: 'user', content: 'tidy up' });
    await act(() => result.current.api.retryLastUserMessage());
    return result.current;
  }

  it('closes and restores the charts a live UpdateDashboard names', async () => {
    const { dashboard, memoryBank } = await respond([
      {
        name: 'UpdateDashboard',
        arguments: {
          message: 'Swapped them.',
          close: [{ chart_id: 'chart_1', key: '0-0' }],
          restore: [{ chart_id: 'chart_2', key: '1-0' }],
        },
      },
    ]);
    expect(dashboard.getState().isActive('0-0')).toBe(false);
    expect(memoryBank.getState().closedVisualizations.has('0-0')).toBe(true);
    expect(dashboard.getState().isActive('1-0')).toBe(true);
  });

  it('only opens the confirmation for a live ResetConversation', async () => {
    const { global, conversation, dashboard } = await respond([
      { name: 'ResetConversation', arguments: { message: 'Start over?' } },
    ]);
    expect(global.getState().resetConfirmOpen).toBe(true);
    expect(conversation.getState().messages).toHaveLength(2);
    expect(dashboard.getState().isActive('0-0')).toBe(true);
  });

  it('sends the dashboard with the request', async () => {
    await respond([]);
    const sent = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.dashboard).toEqual({ open: [{ key: '0-0' }], closed: ['1-0'] });
  });
});

describe('useChatApi after the conversation changes mid-request', () => {
  const reply = [{ name: 'FreeTextExplain', arguments: { text: 'An old answer.' } }];

  it.each([
    ['aborts the request and drops its reply', true],
    ['drops a reply that arrives anyway', false],
  ])('%s', async (_label, honoursAbort) => {
    let respond!: (response: Response) => void;
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          respond = resolve;
          if (honoursAbort) {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <UDIChatProvider>{children}</UDIChatProvider>
    );
    const { result } = renderHook(
      () => ({
        api: useChatApi({ apiBaseUrl: '/api/yac' }),
        conversation: useConversationStore(),
      }),
      { wrapper },
    );
    const conversation = result.current.conversation;
    conversation.getState().addMessage({ role: 'user', content: 'first question' });

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.api.retryLastUserMessage();
    });
    act(() => conversation.getState().newConversation());
    respond(json(reply, 200));
    await act(() => pending);

    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(conversation.getState().messages).toEqual([]);
    expect(conversation.getState().sessionUsage.requests).toBe(0);
    expect(result.current.api.error).toBeNull();
    expect(result.current.api.isLoading).toBe(false);
  });
});
