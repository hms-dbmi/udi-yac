/**
 * @vitest-environment jsdom
 *
 * The crash screen can file an issue report, carrying the error with the
 * session, when the host switched issue reporting on.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('kaboom');
}

afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary issue report', () => {
  it('sends the error with the report', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ traceId: 'trace-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ErrorBoundary issueReport={{ apiBaseUrl: '/api/yac' }}>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Report issue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.source).toBe('crash');
    expect(body.description).toBe('kaboom');
    expect(body.session.error).toMatchObject({ name: 'Error', message: 'kaboom' });
    expect(await screen.findByRole('status')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('offers no report without issue reporting', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole('button', { name: 'Report issue' })).toBeNull();
  });
});
