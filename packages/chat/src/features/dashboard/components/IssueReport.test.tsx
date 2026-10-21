/**
 * @vitest-environment jsdom
 *
 * The issue report form's request. The agent's offer and the form opening on
 * its own are covered in IssueReportOffer.test.tsx and useChatApi.test.tsx.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssueReportForm } from './IssueReport';

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

function renderForm(onDone = vi.fn()) {
  const session = { version: 1, conversation: { messages: [] } };
  render(
    <IssueReportForm
      apiConfig={{ apiBaseUrl: '/api/yac', authToken: 'jwt-1' }}
      draft="The chart is empty"
      source="menu"
      getSession={() => session}
      getConversationId={() => 'conv-1'}
      onDone={onDone}
    />,
  );
  return session;
}

describe('IssueReportForm', () => {
  it('posts the note, contact and session under the conversation id', async () => {
    const fetchMock = stubFetch(json({ traceId: 'abcdef1234567890' }));
    const session = renderForm();

    await userEvent.type(screen.getByLabelText('Contact (optional)'), 'me@example.org');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/yac/v1/yac/issue_report');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer jwt-1',
      'X-Conversation-Id': 'conv-1',
    });
    expect(JSON.parse(init.body)).toEqual({
      description: 'The chart is empty',
      contact: 'me@example.org',
      source: 'menu',
      session,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('abcdef12');
  });

  it('shows why a report was refused', async () => {
    stubFetch(json({ error: 'Issue reporting needs LangFuse.' }, 503));
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Issue reporting needs LangFuse.');
  });

  it('will not send an empty note', async () => {
    const fetchMock = stubFetch(json({ traceId: 't' }));
    renderForm();

    await userEvent.clear(screen.getByLabelText('What went wrong?'));

    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
