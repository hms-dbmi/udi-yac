/**
 * Shared types for the domain computation Web Worker protocol.
 * Used by both src/workers/domainWorker.ts and src/stores/dataPackageStore.ts.
 */
import type { DataFieldDomain } from './dataPackage';

export interface ResourceInput {
  entityName: string;
  /** Pre-fetched CSV/TSV text content. */
  csvText: string;
  delimiter: string;
  fieldDescriptions: Record<string, string>;
}

export interface ComputeDomainsRequest {
  type: 'compute';
  resources: ResourceInput[];
}

export interface EntityDomainsResult {
  type: 'entity-domains';
  entityName: string;
  domains: DataFieldDomain[];
}

export interface DoneResult {
  type: 'done';
}

export interface ErrorResult {
  type: 'error';
  entityName: string;
  message: string;
}

export type WorkerMessage = ComputeDomainsRequest;
export type WorkerResponse = EntityDomainsResult | DoneResult | ErrorResult;
