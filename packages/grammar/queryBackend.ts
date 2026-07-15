import type { DataSource, DataTransformation } from './GrammarTypes';
import type { DataSelections } from './DataSourcesStore';

/**
 * Client-side query backend seam.
 *
 * There are exactly two modes on the client:
 * - `local`  — the existing in-browser Arquero engine (interactive: live
 *   brush filtering against in-memory tables). This object is only a mode
 *   flag; the local execution paths in DataSourcesStore/UDIVis are unchanged.
 * - `remote` — queries are POSTed to a server (`/v1/yac/query`), which
 *   compiles the same grammar to its configured backend (StarRocks, DuckDB,
 *   SQL, ...). The plurality of server backends lives behind that endpoint,
 *   not here.
 *
 * The active backend is a module-level singleton (like the shared Pinia
 * store): set it once per app/session via `setQueryBackend` when the loaded
 * data package declares a remote backend.
 */

export interface QueryDataResult {
  displayData: object[];
  allData: object[];
  isSubset: boolean;
  /** True when the result is aggregated (cube) data rather than row-level.
   *  Only populated by remote backends; undefined locally. */
  aggregated?: boolean;
  /** Present when a row-level result was capped server-side — the browser
   *  received only the first `cap` rows. Never set by the local engine. */
  truncated?: { cap: number; sampled: boolean } | null;
}

export interface RemoteQueryRequest {
  source: DataSource[];
  transformation?: DataTransformation[];
  /** Active selection state (brushes + external filters), keyed by selection
   *  name. The server resolves named `filter` transforms against these. */
  selections?: DataSelections;
  displayDataOnly?: boolean;
}

/** One visualization's slice of a batched /v1/yac/query response. */
export interface RemoteVizResult {
  /** Per-viz failure (e.g. an unsupported spec): the query rejects with this
   *  message; other queries in the batch are unaffected. */
  error?: string;
  displayData: object[];
  /** Unfiltered rows (or a reduced extent set) for stable scale domains —
   *  the server-side analogue of the local `allData` pass. */
  extent?: object[];
  isSubset?: boolean;
  /** True when the result is aggregated (cube) data rather than row-level. */
  aggregated?: boolean;
  /** Present when a row-level result was capped/sampled server-side. */
  truncated?: { cap: number; sampled: boolean } | null;
}

export interface LocalQueryBackend {
  kind: 'local';
  /** Live (per-brush-tick) filtering is available: data is in-memory. */
  interactive: true;
}

export interface RemoteQueryBackend {
  kind: 'remote';
  interactive: false;
  query(request: RemoteQueryRequest): Promise<QueryDataResult | null>;
  /** Fires with `true` when a batch round-trip starts and `false` when the
   *  last in-flight batch settles — drive loading overlays with this.
   *  Returns an unsubscribe function. */
  subscribePending(callback: (pending: boolean) => void): () => void;
}

export type QueryBackend = LocalQueryBackend | RemoteQueryBackend;

export const LOCAL_BACKEND: LocalQueryBackend = {
  kind: 'local',
  interactive: true,
};

let currentBackend: QueryBackend = LOCAL_BACKEND;

/** Set the active query backend. Pass `null` to reset to the local engine. */
export function setQueryBackend(backend: QueryBackend | null): void {
  currentBackend = backend ?? LOCAL_BACKEND;
}

export function getQueryBackend(): QueryBackend {
  return currentBackend;
}

export interface RemoteBackendConfig {
  /** Full endpoint URL, e.g. `${apiBaseUrl}/v1/yac/query`. */
  url: string;
  /** Data package name, forwarded so the server can resolve entity→table
   *  mappings and the package's configured backend. */
  packageName?: string;
  /** Extra request headers (e.g. Authorization). */
  headers?: Record<string, string>;
  /** Coalescing window for batching concurrent queries (ms). Queries issued
   *  within the same window go out as ONE request. Default 0 = same tick. */
  batchWindowMs?: number;
  /** Injectable fetch for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

interface PendingQuery {
  vizId: string;
  request: RemoteQueryRequest;
  resolve: (result: QueryDataResult | null) => void;
  reject: (error: unknown) => void;
}

/**
 * Create a remote backend that POSTs batched queries to `/v1/yac/query`.
 *
 * Batching: all `query()` calls within one `batchWindowMs` window (default:
 * same macrotask tick — e.g. every chart reacting to the same selection
 * change) are sent as a single stateless request:
 *
 *   { package?, selections, queries: [{ vizId, source, transformation? }] }
 *
 * and the response is fanned back out by vizId:
 *
 *   { results: { [vizId]: { displayData, extent?, isSubset?, ... } } }
 */
export function createRemoteBackend(
  config: RemoteBackendConfig,
): RemoteQueryBackend {
  const fetchFn = config.fetchFn ?? fetch;
  let pending: PendingQuery[] = [];
  let flushScheduled = false;
  let vizCounter = 0;
  let inflight = 0;
  const pendingSubscribers = new Set<(pending: boolean) => void>();

  function notifyPending(value: boolean): void {
    for (const cb of pendingSubscribers) cb(value);
  }

  async function flush(): Promise<void> {
    const batch = pending;
    pending = [];
    flushScheduled = false;
    if (batch.length === 0) return;
    if (++inflight === 1) notifyPending(true);

    // All queries in a batch share the dashboard's selection state; merge
    // per-request maps by name (in practice they are the same store state).
    const selections: DataSelections = {};
    for (const q of batch) {
      Object.assign(selections, q.request.selections);
    }

    try {
      const response = await fetchFn(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...config.headers },
        body: JSON.stringify({
          ...(config.packageName ? { package: config.packageName } : {}),
          selections,
          queries: batch.map((q) => ({
            vizId: q.vizId,
            source: q.request.source,
            transformation: q.request.transformation,
            displayDataOnly: q.request.displayDataOnly,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(`Remote query backend: HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        results?: Record<string, RemoteVizResult>;
      };
      for (const q of batch) {
        const result = body.results?.[q.vizId];
        if (!result) {
          // Same semantics as the local engine returning null: caller keeps
          // its previous data.
          q.resolve(null);
          continue;
        }
        if (result.error) {
          q.reject(new Error(`Remote query failed: ${result.error}`));
          continue;
        }
        q.resolve({
          displayData: result.displayData,
          allData: result.extent ?? result.displayData,
          isSubset: result.isSubset ?? false,
          ...(result.aggregated !== undefined
            ? { aggregated: result.aggregated }
            : {}),
          ...(result.truncated ? { truncated: result.truncated } : {}),
        });
      }
    } catch (error) {
      for (const q of batch) {
        q.reject(error);
      }
    } finally {
      if (--inflight === 0) notifyPending(false);
    }
  }

  return {
    kind: 'remote',
    interactive: false,
    query(request: RemoteQueryRequest): Promise<QueryDataResult | null> {
      return new Promise((resolve, reject) => {
        pending.push({ vizId: `q${++vizCounter}`, request, resolve, reject });
        if (!flushScheduled) {
          flushScheduled = true;
          setTimeout(() => void flush(), config.batchWindowMs ?? 0);
        }
      });
    },
    subscribePending(callback: (pending: boolean) => void): () => void {
      pendingSubscribers.add(callback);
      return () => pendingSubscribers.delete(callback);
    },
  };
}
