import { createStore } from 'zustand/vanilla';
import type {
  DataFieldDomain,
  DataPackage,
  CategoricalDomain,
  ValidStatus,
  EntityRelationship,
  ExportRowSet,
} from '@/types/dataPackage';
import { joinDataPath } from '@/features/data-package';
import type { ResourceInput } from '../types';
import DomainWorker from '../workers/domainWorker?worker&inline';

export type LoadingPhase = 'idle' | 'fetching' | 'domains' | 'ready' | 'error';

export interface DataPackageState {
  dataPackage: DataPackage | null;
  dataFieldDomains: DataFieldDomain[];
  loadingPhase: LoadingPhase;
  error: string | null;
  // Cached derived values (updated by fetchDataPackage, not recomputed per selector call)
  sourceFields: Record<string, string[]> | null;
  quantitativeSourceFields: Record<string, string[]> | null;
  categoricalSourceFields: Record<string, string[]> | null;
  entityNames: string[];
  dataPackageString: string;
  dataDomainsString: string;
  /** Maps entity names to canonical data URLs (from udi:path + resource.path). */
  sourceResolver: Record<string, string>;
  filteredData: Map<string, ExportRowSet>;
  fetchDataPackage: (path: string, fetchOptions?: RequestInit) => Promise<void>;
  setDataPackage: (
    dataPackage: DataPackage,
    precomputedDomains?: DataFieldDomain[],
    fetchOptions?: RequestInit,
  ) => Promise<void>;
  getDomainForField: (entity: string, field: string) => DataFieldDomain | undefined;
  isValidIntervalFilter: (entity: string, field: string) => ValidStatus;
  isValidPointFilter: (entity: string, field: string, values: unknown[]) => ValidStatus;
  getEntityRelationship: (originSource: string, targetSource: string) => EntityRelationship | null;
  setFilteredData: (entity: string, data: ExportRowSet) => void;
}

function removeVestigialInfo(data: DataPackage | null): DataPackage | null {
  if (!data?.resources || !Array.isArray(data.resources)) return data;
  const clone = jsonClone(data);
  for (const resource of clone.resources) {
    if (resource.schema?.fields && Array.isArray(resource.schema.fields)) {
      for (const field of resource.schema.fields as Array<Record<string, unknown>>) {
        delete field['udi:overlapping_fields'];
      }
    }
  }
  return clone;
}

function removeLongDomains(data: DataFieldDomain[], threshold = 80): DataFieldDomain[] {
  return data.filter(
    (d) => d.type === 'interval' || (d.domain as CategoricalDomain).values.length < threshold,
  );
}

function computeSourceFields(dp: DataPackage | null): Record<string, string[]> | null {
  if (!dp?.resources) return null;
  const fieldsMap: Record<string, string[]> = {};
  for (const resource of dp.resources) {
    if (!resource.name || !resource.schema?.fields) continue;
    fieldsMap[resource.name] = resource.schema.fields.map((f) => f.name);
  }
  return fieldsMap;
}

function computeQuantitativeSourceFields(dp: DataPackage | null): Record<string, string[]> | null {
  if (!dp?.resources) return null;
  const fieldsMap: Record<string, string[]> = {};
  for (const resource of dp.resources) {
    if (!resource.name || !resource.schema?.fields) continue;
    fieldsMap[resource.name] = resource.schema.fields
      .filter((f) => f['udi:data_type'] === 'quantitative')
      .map((f) => f.name);
  }
  return fieldsMap;
}

function computeCategoricalSourceFields(dp: DataPackage | null): Record<string, string[]> | null {
  if (!dp?.resources) return null;
  const fieldsMap: Record<string, string[]> = {};
  for (const resource of dp.resources) {
    if (!resource.name || !resource.schema?.fields) continue;
    fieldsMap[resource.name] = resource.schema.fields
      .filter((f) => f['udi:data_type'] === 'ordinal' || f['udi:data_type'] === 'nominal')
      .map((f) => f.name);
  }
  return fieldsMap;
}

function computeEntityNames(dp: DataPackage | null): string[] {
  if (!dp?.resources) return [];
  return dp.resources.map((r) => r.name);
}

function computeSourceResolver(dp: DataPackage | null): Record<string, string> {
  if (!dp?.resources) return {};
  const basePath = dp['udi:path'] ?? '';
  const resolver: Record<string, string> = {};
  for (const resource of dp.resources) {
    if (resource.name && resource.path) {
      resolver[resource.name] = joinDataPath(basePath, resource.path);
    }
  }
  return resolver;
}

function computeDataPackageString(dp: DataPackage | null): string {
  if (!dp) return '';
  return JSON.stringify(removeVestigialInfo(dp));
}

function computeDataDomainsString(domains: DataFieldDomain[]): string {
  if (domains.length === 0) return '';
  return JSON.stringify(removeLongDomains(domains));
}

export function createDataPackageStore() {
  return createStore<DataPackageState>()((set, get) => ({
    dataPackage: null,
    dataFieldDomains: [],
    loadingPhase: 'idle',
    error: null,
    sourceFields: null,
    quantitativeSourceFields: null,
    categoricalSourceFields: null,
    entityNames: [],
    dataPackageString: '',
    dataDomainsString: '',
    sourceResolver: {},
    filteredData: new Map(),

    getDomainForField: (entity: string, field: string) => {
      return get().dataFieldDomains.find((d) => d.entity === entity && d.field === field);
    },

    isValidIntervalFilter: (entity: string, field: string): ValidStatus => {
      const state = get();
      if (!state.dataPackage?.resources) return { isValid: 'unknown' };
      const domain = state.getDomainForField(entity, field);
      if (!domain) return { isValid: 'no' };
      return { isValid: 'yes' };
    },

    isValidPointFilter: (entity: string, field: string, values: unknown[]): ValidStatus => {
      const state = get();
      if (!state.dataPackage?.resources) return { isValid: 'unknown' };
      const domain = state.getDomainForField(entity, field);
      if (!domain) return { isValid: 'no' };
      const validValues = (domain.domain as CategoricalDomain).values;
      if (!validValues) return { isValid: 'no' };
      const isValid = values.every((v) => validValues.includes(v as string));
      return { isValid: isValid ? 'yes' : 'no' };
    },

    getEntityRelationship: (
      originSource: string,
      targetSource: string,
    ): EntityRelationship | null => {
      const dp = get().dataPackage;
      if (!dp?.resources) return null;

      const searchOneDirection = (source: string, target: string, reverse = false) => {
        for (const resource of dp.resources) {
          if (resource.name !== source) continue;
          const fks = resource.schema?.foreignKeys ?? [];
          for (const fk of fks) {
            if (fk.reference.resource === target) {
              const key1 = fk.fields[fk.fields.length - 1];
              const key2 = fk.reference.fields[fk.reference.fields.length - 1];
              if (reverse) return { originKey: key2, targetKey: key1 };
              return { originKey: key1, targetKey: key2 };
            }
          }
        }
        return null;
      };
      return (
        searchOneDirection(originSource, targetSource) ??
        searchOneDirection(targetSource, originSource, true)
      );
    },

    setFilteredData: (entity: string, data: ExportRowSet) => {
      set((state) => {
        const next = new Map(state.filteredData);
        next.set(entity, data);
        return { filteredData: next };
      });
    },

    fetchDataPackage: async (path: string, fetchOptions?: RequestInit) => {
      set({ loadingPhase: 'fetching', error: null });
      try {
        const response = await fetch(path, fetchOptions);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const json = (await response.json()) as DataPackage;
        if (json.resources && Array.isArray(json.resources)) {
          json.resources = json.resources.filter(
            (r) => r['udi:row_count'] && r['udi:row_count']! > 0,
          );
        }
        applyDataPackage(set, json);
        set({ loadingPhase: 'domains' });
        await loadDomainsFromCSVs(set, json, fetchOptions);
        set({ loadingPhase: 'ready' });
      } catch (e) {
        set({ error: String(e), loadingPhase: 'error' });
      }
    },

    setDataPackage: async (
      dp: DataPackage,
      precomputedDomains?: DataFieldDomain[],
      fetchOptions?: RequestInit,
    ) => {
      set({ loadingPhase: 'fetching', error: null });
      try {
        const filtered: DataPackage = {
          ...dp,
          resources: (dp.resources ?? []).filter(
            (r) => r['udi:row_count'] && r['udi:row_count'] > 0,
          ),
        };
        applyDataPackage(set, filtered);

        if (precomputedDomains) {
          set({
            loadingPhase: 'ready',
            dataFieldDomains: precomputedDomains,
            dataDomainsString: computeDataDomainsString(precomputedDomains),
          });
          return;
        }

        set({ loadingPhase: 'domains' });
        await loadDomainsFromCSVs(set, filtered, fetchOptions);
        set({ loadingPhase: 'ready' });
      } catch (e) {
        set({ error: String(e), loadingPhase: 'error' });
      }
    },
  }));
}

/** Set derived state from a parsed data package (shared by fetch and set paths).
 *  Does NOT set loading — the caller manages the loading lifecycle. */
function applyDataPackage(set: (partial: Partial<DataPackageState>) => void, json: DataPackage) {
  set({
    dataPackage: json,
    sourceFields: computeSourceFields(json),
    quantitativeSourceFields: computeQuantitativeSourceFields(json),
    categoricalSourceFields: computeCategoricalSourceFields(json),
    entityNames: computeEntityNames(json),
    dataPackageString: computeDataPackageString(json),
    sourceResolver: computeSourceResolver(json),
  });
}

type SetFn = (
  partial: Partial<DataPackageState> | ((state: DataPackageState) => Partial<DataPackageState>),
) => void;

/** Apply a batch of domains for one entity into the store. */
function applyEntityDomains(set: SetFn, domains: DataFieldDomain[]) {
  set((state) => {
    const nextDomains = [...state.dataFieldDomains, ...domains];
    return {
      dataFieldDomains: nextDomains,
      dataDomainsString: computeDataDomainsString(nextDomains),
    };
  });
}

/**
 * Fetch CSV text for each resource on the main thread (priming the browser
 * HTTP cache so UDIVis won't re-fetch), then offload the parsing + domain
 * computation to a Web Worker. Falls back to main-thread parsing if the
 * worker fails to initialize.
 */
async function loadDomainsFromCSVs(set: SetFn, dp: DataPackage, fetchOptions?: RequestInit) {
  const folderPath = dp['udi:path'];
  if (!folderPath) {
    console.warn('DataPackage has no udi:path — skipping CSV domain loading');
    return;
  }

  // Fetch all CSV text on the main thread (primes browser cache for UDIVis).
  const resources: ResourceInput[] = [];
  for (const resource of dp.resources ?? []) {
    const fullPath = joinDataPath(folderPath, resource.path);
    const delimiter = fullPath.endsWith('.tsv') ? '\t' : ',';
    const fieldDescriptions: Record<string, string> = {};
    for (const f of resource.schema?.fields ?? []) {
      fieldDescriptions[f.name] = f.description ?? '';
    }
    try {
      const response = await fetch(fullPath, fetchOptions);
      const csvText = await response.text();
      resources.push({ entityName: resource.name, csvText, delimiter, fieldDescriptions });
    } catch (e) {
      console.error(`Failed to fetch data for ${resource.name}:`, e);
    }
  }

  if (resources.length === 0) return;

  try {
    await loadDomainsViaWorker(set, resources);
  } catch {
    // Worker failed to start — fall back to main thread
    await loadDomainsMainThread(set, resources);
  }
}

/** Offload domain computation to a dedicated Web Worker. */
function loadDomainsViaWorker(set: SetFn, resources: ResourceInput[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new DomainWorker();
    } catch (e) {
      reject(e);
      return;
    }

    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'entity-domains') {
        applyEntityDomains(set, msg.domains as DataFieldDomain[]);
      } else if (msg.type === 'error') {
        console.error(`Worker: failed to load data for ${msg.entityName}:`, msg.message);
      } else if (msg.type === 'done') {
        worker.terminate();
        resolve();
      }
    };

    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };

    worker.postMessage({ type: 'compute', resources });
  });
}

/** Main-thread fallback: parse pre-fetched CSV text with Arquero. */
async function loadDomainsMainThread(set: SetFn, resources: ResourceInput[]) {
  const { fromCSV } = await import('arquero');
  for (const resource of resources) {
    try {
      const table = fromCSV(resource.csvText, { delimiter: resource.delimiter });
      const cols = table.columnNames();
      const domains: DataFieldDomain[] = [];
      for (const col of cols) {
        const series = table.array(col) as unknown[];
        const isNumeric = series.every((v) => v == null || !isNaN(+(v as number)));
        if (isNumeric) {
          const stats = table
            .rollup({
              min: `(d) => op.min(d["${col}"])`,
              max: `(d) => op.max(d["${col}"])`,
            })
            .objects()[0] as { min: number; max: number };
          domains.push({
            entity: resource.entityName,
            field: col,
            type: 'interval',
            fieldDescription: resource.fieldDescriptions[col] ?? '',
            domain: { min: stats.min, max: stats.max },
          });
        } else {
          domains.push({
            entity: resource.entityName,
            field: col,
            type: 'point',
            fieldDescription: resource.fieldDescriptions[col] ?? '',
            domain: { values: Array.from(new Set(series)) as string[] },
          });
        }
      }
      applyEntityDomains(set, domains);
    } catch (e) {
      console.error(`Failed to parse data for ${resource.entityName}:`, e);
    }
  }
}

function jsonClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
