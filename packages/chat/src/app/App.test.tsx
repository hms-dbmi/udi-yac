/**
 * @vitest-environment jsdom
 *
 * The standalone app's one piece of real logic: `VITE_UDI_INITIAL_SESSION`
 * names a file, and render is held until that fetch settles. Rendering early
 * is not merely blank — `UDIChat` restores the persisted layout when
 * `initialSession` is null, so a late arrival would overwrite itself.
 *
 * `env` reads `import.meta.env` at module load, so each case stubs the
 * variable and then imports App fresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const chatProps = vi.fn();
vi.mock('@/app/UDIChat', () => ({
  UDIChat: (props: Record<string, unknown>) => {
    chatProps(props);
    return <div data-testid="udi-chat" />;
  },
}));

async function renderApp() {
  vi.resetModules();
  const { default: App } = await import('./App');
  return render(<App />);
}

beforeEach(() => {
  chatProps.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('App — initial session', () => {
  it('renders straight away when no session file is configured', async () => {
    await renderApp();
    expect(screen.getByTestId('udi-chat')).toBeTruthy();
    expect(chatProps.mock.calls[0][0].initialSession).toBeUndefined();
  });

  it('holds the render until the session file has loaded, then passes it on', async () => {
    const session = { version: 1, visualizations: [] };
    let resolveFetch: (r: unknown) => void = () => {};
    vi.stubEnv('VITE_UDI_INITIAL_SESSION', '/demo-session.json');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))),
    );

    await renderApp();
    expect(screen.queryByTestId('udi-chat')).toBeNull();

    resolveFetch({ ok: true, json: () => Promise.resolve(session) });
    expect(await screen.findByTestId('udi-chat')).toBeTruthy();
    expect(chatProps.mock.lastCall?.[0].initialSession).toEqual(session);
  });

  it('starts empty rather than blank when the file is missing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('VITE_UDI_INITIAL_SESSION', '/gone.json');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' })),
    );

    await renderApp();

    expect(await screen.findByTestId('udi-chat')).toBeTruthy();
    expect(chatProps.mock.lastCall?.[0].initialSession).toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
