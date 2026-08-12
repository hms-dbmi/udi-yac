import { createPinia } from 'pinia';
import { defineCustomElement, watch } from 'vue';
import UDIVisComp from './UDIVis.vue';
import type {
  UDIGrammar,
  DataSource,
  DataTransformation,
} from './GrammarTypes';
import {
  useDataSourcesStore,
  type DataSelections,
  type CubeMetadata,
} from './DataSourcesStore';
import {
  loadDataPackage as loadDataPackageImpl,
  type SourceSpec,
  type LoadDataPackageOptions,
} from './loadDataPackage';
import type {
  DataFieldDomain,
  IntervalDomain,
  CategoricalDomain,
} from './domainTypes';
import { getQueryBackend, type QueryDataResult } from './queryBackend';

// Shared Pinia instance for all <udi-vis> elements on the page.
// This enables cross-chart filtering: all instances share the same
// DataSourcesStore, just like they do in the Vue plugin setup.
const pinia = createPinia();

const UDIVisElement = defineCustomElement(UDIVisComp, {
  shadowRoot: false,
  configureApp(app) {
    app.use(pinia);
  },
});

// Guarded: this module is imported at module scope by the react-wrapper's
// queryData/selections/loadDataPackage helpers, none of which check first. If a
// second copy of this bundle is on the page, an unguarded define() throws
// NotSupportedError during module evaluation and takes those helpers down with
// it — charts keep rendering (served by the first copy) while data loading and
// selection reset fail permanently.
if (!customElements.get('udi-vis')) {
  customElements.define('udi-vis', UDIVisElement);
}

// ── Data-only query API ──────────────────────────────────────────────────────
// Provides direct access to the Arquero transformation pipeline without
// mounting a UDIVis component. Shares the same DataSourcesStore (and its
// CSV cache + selection state) as all <udi-vis> elements on the page.

export interface QueryDataSpec {
  source: DataSource | DataSource[];
  transformation?: DataTransformation[];
}

// Re-exported from the backend seam so existing imports keep working.
export type { QueryDataResult };

// ── Query backend seam ──────────────────────────────────────────────────────
// Local (default) = the in-browser Arquero engine below. Remote = batched
// POSTs to a /v1/yac/query server. See queryBackend.ts.
export {
  setQueryBackend,
  getQueryBackend,
  createRemoteBackend,
  LOCAL_BACKEND,
} from './queryBackend';
export type {
  QueryBackend,
  LocalQueryBackend,
  RemoteQueryBackend,
  RemoteQueryRequest,
  RemoteVizResult,
  RemoteBackendConfig,
} from './queryBackend';

export interface QueryDataOptions {
  /** Maps entity names → canonical URLs, overriding URLs embedded in the spec. */
  sourceResolver?: Record<string, string>;
  /** Skip materializing the full unfiltered table for `allData`. When true,
   *  `allData` shares its reference with `displayData`. Use this when the
   *  caller only reads `displayData` — the second pipeline pass is the
   *  most expensive part of getDataObject for non-rollup specs.
   *
   *  When omitted, defaults to `true` if the transformation ends with a
   *  rollup (the unfiltered aggregate is rarely consumed) and `false`
   *  otherwise. Pass `false` explicitly to force the unfiltered pass. */
  displayDataOnly?: boolean;
}

/**
 * Run a data query against the shared DataSourcesStore.
 *
 * Loads any uncached CSVs, applies the transformation pipeline (including
 * named filters from active selections), and returns the result.
 *
 * @param spec  A grammar-like object with `source` and optional `transformation`.
 * @param selections  Optional external selections to bind before querying.
 * @param options  Optional per-call options (sourceResolver, displayDataOnly).
 * @returns The transformed data, or `null` if sources are still loading.
 */
export async function queryData(
  spec: QueryDataSpec,
  selections?: DataSelections,
  options?: QueryDataOptions,
): Promise<QueryDataResult | null> {
  const store = useDataSourcesStore(pinia);

  const sources: DataSource[] = Array.isArray(spec.source)
    ? spec.source
    : [spec.source];

  const backend = getQueryBackend();
  if (backend.kind === 'remote') {
    // Include live brush state alongside the caller's external selections —
    // the local path picks brushes up implicitly from the shared store, so
    // the remote path must forward them explicitly.
    return backend.query({
      source: sources,
      transformation: spec.transformation,
      selections: { ...store.dataSelections, ...selections },
      displayDataOnly: options?.displayDataOnly === true,
    });
  }

  await store.initDataSources(sources, options?.sourceResolver);

  if (selections) {
    store.bindExternalDataSelections(selections);
  }

  const result = store.getDataObject(
    sources.map((s) => s.name),
    spec.transformation,
    { displayDataOnly: options?.displayDataOnly === true },
  );

  if (!result) return null;

  return {
    displayData: result.displayData,
    allData: result.allData,
    isSubset: result.isDisplayDataSubset,
  };
}

/**
 * Fetch a set of CSVs exactly once, seed the shared DataSourcesStore so
 * any <udi-vis> / queryData call reuses the parsed tables, and stream
 * per-entity domains back via callbacks.
 */
export function loadDataPackage(
  sources: SourceSpec[],
  options?: LoadDataPackageOptions,
): Promise<void> {
  return loadDataPackageImpl(pinia, sources, options);
}

/**
 * Cube metadata registered for `sourceName` by `loadDataPackage`, or null
 * when the source is a plain row-level table. Callers use this to decide
 * whether a source must be read by marginal selection (see `only`) rather
 * than filtered row-wise.
 */
export function getCubeMetadata(sourceName: string): CubeMetadata | null {
  const store = useDataSourcesStore(pinia);
  return store.getCubeMetadata(sourceName);
}

/**
 * Fire `callback` whenever any selection in the shared DataSourcesStore
 * changes — brushes from `<udi-vis>` signals, programmatic updates from
 * queryData's `selections` binding, or `clearAllSelections()`.
 *
 * Returns an `unsubscribe` function. Use this when you want to react to
 * brush state without subscribing to a mirror in your own framework's
 * state store (avoids re-rendering on every 60Hz brush tick).
 */
export function subscribeToSelections(callback: () => void): () => void {
  const store = useDataSourcesStore(pinia);
  return watch(
    () => store.selectionHash,
    () => callback(),
    { flush: 'sync' },
  );
}

/**
 * Clear every active selection. Intended for consumers' "reset session"
 * flows; brush selections naturally clear via Vega when a chart unmounts,
 * but this drops the bookkeeping entries so they don't accumulate.
 */
export function clearAllSelections(): void {
  const store = useDataSourcesStore(pinia);
  store.clearAllSelections();
}

/**
 * Returns a snapshot of the current selection state. The snapshot's object
 * identity is stable across calls until `selectionHash` flips — required by
 * React's `useSyncExternalStore`, which would otherwise see a new reference
 * on every render and tear infinitely. Pair with `subscribeToSelections` to
 * build a reactive read in a host framework.
 */
let cachedSelectionsHash: string | null = null;
let cachedSelectionsSnapshot: DataSelections = {};
export function getDataSelections(): DataSelections {
  const store = useDataSourcesStore(pinia);
  if (store.selectionHash !== cachedSelectionsHash) {
    cachedSelectionsHash = store.selectionHash;
    cachedSelectionsSnapshot = { ...store.dataSelections };
  }
  return cachedSelectionsSnapshot;
}

export { UDIVisElement };
export { DEFAULT_PALETTE } from './Palette';
export type { UDIGrammar, DataSelections };
export type { UDIPalette, ContinuousColor, DiscreteColor } from './Palette';
export type {
  SourceSpec,
  LoadDataPackageOptions,
  DataFieldDomain,
  IntervalDomain,
  CategoricalDomain,
  CubeMetadata,
};
