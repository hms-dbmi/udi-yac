import type { UDIGrammar } from './dist/GrammarTypes';
import type { DataSelections, CubeMetadata } from './dist/DataSourcesStore';
import type {
  QueryDataSpec,
  QueryDataResult,
  QueryDataOptions,
} from './dist/ce-entry';
import type {
  SourceSpec,
  LoadDataPackageOptions,
} from './dist/loadDataPackage';
import type {
  DataFieldDomain,
  IntervalDomain,
  CategoricalDomain,
  CubeMetadata,
} from './dist/domainTypes';
import type {
  UDIPalette,
  ContinuousColor,
  DiscreteColor,
} from './dist/Palette';

export declare const UDIVisElement: CustomElementConstructor;

/**
 * Headless data query against the shared DataSourcesStore. Loads any
 * uncached sources, applies the transformation pipeline, and returns
 * the result — no chart mounted.
 */
export declare function queryData(
  spec: QueryDataSpec,
  selections?: DataSelections,
  options?: QueryDataOptions,
): Promise<QueryDataResult | null>;

/**
 * Fetch each CSV exactly once, seed the shared DataSourcesStore (so
 * subsequent <udi-vis> renders reuse the parsed table instead of
 * re-fetching), and stream per-field domains back via callbacks. The
 * domain computation runs in a Web Worker; falls back to the main
 * thread if Worker construction throws.
 */
export declare function loadDataPackage(
  sources: SourceSpec[],
  options?: LoadDataPackageOptions,
): Promise<void>;

/**
 * Fire `callback` whenever any selection in the shared DataSourcesStore
 * changes — brushes from <udi-vis> signals, programmatic bindings, or
 * clearAllSelections(). Returns an unsubscribe function.
 */
export declare function subscribeToSelections(callback: () => void): () => void;

/** Wipe every active selection in the shared DataSourcesStore. */
export declare function clearAllSelections(): void;

/** Snapshot of every active selection in the shared DataSourcesStore. */
export declare function getDataSelections(): DataSelections;

/**
 * Cube metadata registered for `sourceName` by `loadDataPackage`, or null
 * when the source is a plain row-level table.
 */
export declare function getCubeMetadata(
  sourceName: string,
): CubeMetadata | null;

/*
 * Query backend seam. Local (the default) is the in-browser Arquero engine;
 * remote batches POSTs to a /v1/yac/query server. Re-exported from the built
 * declarations rather than restated, so the signatures cannot drift.
 */
export {
  setQueryBackend,
  getQueryBackend,
  createRemoteBackend,
  LOCAL_BACKEND,
} from './dist/queryBackend';
export type {
  QueryBackend,
  LocalQueryBackend,
  RemoteQueryBackend,
  RemoteQueryRequest,
  RemoteVizResult,
  RemoteBackendConfig,
} from './dist/queryBackend';

/** Time columns (`udi:time_format`), so charts and tables show dates, years and ages. */
export { setTimeFormats, formatTime } from './dist/temporal';
export type { TimeFormats } from './dist/temporal';

/**
 * The palette the toolkit falls back to when no `palette` is supplied. Exported
 * so a consumer can spread it and override individual channels.
 */
export declare const DEFAULT_PALETTE: UDIPalette;

// Record links: set `recordUrl` on a <udi-vis> element as a JS property.
export type { RecordUrlFn } from './dist/recordUrl';

export type {
  UDIGrammar,
  DataSelections,
  QueryDataSpec,
  QueryDataResult,
  QueryDataOptions,
  SourceSpec,
  LoadDataPackageOptions,
  DataFieldDomain,
  IntervalDomain,
  CategoricalDomain,
  CubeMetadata,
  UDIPalette,
  ContinuousColor,
  DiscreteColor,
};
