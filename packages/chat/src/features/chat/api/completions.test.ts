import { describe, it, expect, vi, afterEach } from 'vitest';
import { queryLLM } from '@/features/chat/api/completions';

/**
 * The agent honors a requested model only alongside an `X-OpenAI-Key`, so
 * whoever pays for the tokens picks the model. Sending it without a key would
 * just be ignored server-side — so the client doesn't send it.
 */
function mockFetch() {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const body = (fetchMock: ReturnType<typeof mockFetch>) =>
  JSON.parse(fetchMock.mock.calls[0][1].body as string);

afterEach(() => vi.unstubAllGlobals());

describe('queryLLM model handling', () => {
  it('sends the model when the user supplied their own key', async () => {
    const fetchMock = mockFetch();
    await queryLLM(
      { apiBaseUrl: 'http://localhost:8007', model: 'gpt-4o-mini', openAiKey: 'sk-user' },
      [],
      '{}',
      '[]',
    );
    expect(body(fetchMock).model).toBe('gpt-4o-mini');
    expect(fetchMock.mock.calls[0][1].headers['X-OpenAI-Key']).toBe('sk-user');
  });

  it('omits the model when there is no user key', async () => {
    const fetchMock = mockFetch();
    await queryLLM({ apiBaseUrl: 'http://localhost:8007', model: 'gpt-4o-mini' }, [], '{}', '[]');
    expect(body(fetchMock)).not.toHaveProperty('model');
  });

  it('omits the model when none is configured', async () => {
    const fetchMock = mockFetch();
    await queryLLM({ apiBaseUrl: 'http://localhost:8007', openAiKey: 'sk-user' }, [], '{}', '[]');
    expect(body(fetchMock)).not.toHaveProperty('model');
  });
});
