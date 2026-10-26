import { afterEach, describe, expect, it, vi } from 'vitest';
import { joinDataPath, loadStudioDataPackage } from './dataPackage';

// The toolkit's loadDataPackage needs a browser + Pinia; the tests here only
// exercise the descriptor fetch, which happens before it is called.
const loadDataPackage = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('udi-toolkit/react', () => ({ loadDataPackage }));

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  loadDataPackage.mockClear();
});

describe('joinDataPath', () => {
  it('normalizes the "./data/x/" form the datapackages use', () => {
    expect(joinDataPath('./data/hubmap/', 'donors.tsv')).toBe('/data/hubmap/donors.tsv');
  });

  it('tolerates a missing trailing slash and a leading ./ on the file', () => {
    expect(joinDataPath('./data/hubmap', './donors.tsv')).toBe('/data/hubmap/donors.tsv');
  });
});

describe('loadStudioDataPackage', () => {
  it('explains that the dev server is unreachable rather than surfacing "Failed to fetch"', async () => {
    // What the browser throws when the dev server has been stopped — the exact
    // situation that produced a bare "Failed to fetch" in the UI.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(loadStudioDataPackage('/data/hubmap_cube/datapackage.json')).rejects.toThrow(
      /cannot reach the dev server/i,
    );
  });

  it('names unsynced sample data when Vite answers with its SPA fallback', async () => {
    // A missing public/data/<pkg> returns index.html with a 200, so `ok` is true
    // and only the content type reveals the problem.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      })),
    );

    await expect(loadStudioDataPackage('/data/hubmap_cube/datapackage.json')).rejects.toThrow(
      /sync-data/,
    );
  });

  it('reports the status code for a genuine HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({}),
      })),
    );

    await expect(loadStudioDataPackage('/data/nope/datapackage.json')).rejects.toThrow(/HTTP 404/);
  });

  it('builds a sourceResolver and skips empty resources', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          'udi:path': './data/hubmap/',
          resources: [
            { name: 'donors', path: 'donors.tsv', 'udi:row_count': 499 },
            { name: 'empty', path: 'empty.tsv', 'udi:row_count': 0 },
          ],
        }),
      ),
    );

    const result = await loadStudioDataPackage('/data/hubmap/datapackage.json');
    expect(result.sourceResolver).toEqual({ donors: '/data/hubmap/donors.tsv' });
    expect(result.entityNames).toEqual(['donors']);
    expect(loadDataPackage).toHaveBeenCalledOnce();
  });
});
