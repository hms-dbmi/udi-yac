import { describe, it, expect, vi, beforeEach } from 'vitest';

const createRemoteBackend = vi.fn();
const setQueryBackend = vi.fn();

vi.mock('udi-toolkit/react', () => ({
  createRemoteBackend: (config: unknown) => createRemoteBackend(config),
  setQueryBackend: (backend: unknown) => setQueryBackend(backend),
  loadDataPackage: vi.fn(async () => ({ sourceFields: {} })),
}));

import { createDataPackageStore } from './dataPackageStore';

/** Minimal metadata payload — just enough for fetchRemotePackage to proceed. */
const METADATA = {
  dataSchema: { 'udi:path': '', resources: [] },
  dataDomains: [],
};

function mockBackend() {
  return { subscribePending: vi.fn(), query: vi.fn() };
}

beforeEach(() => {
  createRemoteBackend.mockReset().mockImplementation(async () => mockBackend());
  setQueryBackend.mockReset();
});

/** The headers the store handed to createRemoteBackend, resolved now. */
function currentBackendHeaders(): Record<string, string> {
  const config = createRemoteBackend.mock.calls[0][0] as {
    headers: Record<string, string> | (() => Record<string, string>);
  };
  return typeof config.headers === 'function' ? config.headers() : config.headers;
}

async function loadRemote(authToken?: string) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => METADATA,
  })) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fetchMock);

  const store = createDataPackageStore();
  await store.getState().fetchRemotePackage('https://api.test', 'pkg', authToken);
  return { store, fetchMock: fetchMock as unknown as ReturnType<typeof vi.fn> };
}

describe('dataPackageStore — remote backend auth token', () => {
  it('sends the initial token on the metadata request', async () => {
    const { fetchMock } = await loadRemote('token-1');
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toEqual({
      Authorization: 'Bearer token-1',
    });
  });

  it('falls back to the dev placeholder when no token is supplied', async () => {
    await loadRemote(undefined);
    expect(currentBackendHeaders()).toEqual({ Authorization: 'Bearer dev' });
  });

  it('gives the backend a header function rather than a captured object', async () => {
    await loadRemote('token-1');
    const config = createRemoteBackend.mock.calls[0][0] as { headers: unknown };
    // A captured object is precisely what made the token go stale.
    expect(typeof config.headers).toBe('function');
  });

  it('serves the refreshed token to the backend without reloading anything', async () => {
    const { store, fetchMock } = await loadRemote('token-1');
    expect(currentBackendHeaders()).toEqual({ Authorization: 'Bearer token-1' });

    const fetchesBefore = fetchMock.mock.calls.length;
    store.getState().setAuthToken('token-2');

    expect(currentBackendHeaders()).toEqual({ Authorization: 'Bearer token-2' });
    // The whole point: no refetch, and no second backend.
    expect(fetchMock.mock.calls.length).toBe(fetchesBefore);
    expect(createRemoteBackend).toHaveBeenCalledTimes(1);
    expect(setQueryBackend).toHaveBeenCalledTimes(1);
  });

  it('seeds the store from the token passed to fetchRemotePackage', async () => {
    const { store } = await loadRemote('token-1');
    expect(store.getState().authToken).toBe('token-1');
  });
});
