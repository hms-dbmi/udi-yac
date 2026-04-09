import { createStore } from 'zustand/vanilla';
import type {
  DataFieldDomain,
  DataPackage,
  CategoricalDomain,
  ValidStatus,
  EntityRelationship,
  ExportRowSet,
} from '@/types/dataPackage';
import { joinDataPath } from '@/utils/joinDataPath';

export type LoadingPhase = 'idle' | 'fetching' | 'domains' | 'ready';

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

function removeVestigialInfo(data: any): any {
  if (!data?.resources || !Array.isArray(data.resources)) return data;
  const clone = jsonClone(data);
  for (const resource of clone.resources) {
    if (resource.schema?.fields && Array.isArray(resource.schema.fields)) {
      for (const field of resource.schema.fields) {
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
        const json = await response.json();
        if (json.resources && Array.isArray(json.resources)) {
          json.resources = json.resources.filter(
            (r: any) => r['udi:row_count'] && r['udi:row_count'] > 0,
          );
        }
        applyDataPackage(set, json);
        set({ loadingPhase: 'domains' });
        await loadDomainsFromCSVs(set, json, fetchOptions);
      } catch (e) {
        set({ error: String(e), loadingPhase: 'idle' });
      } finally {
        set({ loadingPhase: 'ready' });
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
      } catch (e) {
        set({ error: String(e), loadingPhase: 'idle' });
      } finally {
        set({ loadingPhase: 'ready' });
      }
    },
  }));
}

/** Set derived state from a parsed data package (shared by fetch and set paths).
 *  Does NOT set loading — the caller manages the loading lifecycle. */
function applyDataPackage(
  set: (partial: Partial<DataPackageState>) => void,
  json: DataPackage,
) {
  set({
    dataPackage: json,
    sourceFields: computeSourceFields(json),
    quantitativeSourceFields: computeQuantitativeSourceFields(json),
    categoricalSourceFields: computeCategoricalSourceFields(json),
    entityNames: computeEntityNames(json),
    dataPackageString: computeDataPackageString(json),
  });
}

type SetFn = (
  partial:
    | Partial<DataPackageState>
    | ((state: DataPackageState) => Partial<DataPackageState>),
) => void;

/** Prepare the resource list that both worker and fallback paths consume. */
function buildResourceInputs(dp: DataPackage) {
  const folderPath = dp['udi:path'];
  if (!folderPath) return null;
  return (dp.resources ?? []).map((resource) => {
    const fieldDescriptions: Record<string, string> = {};
    for (const f of resource.schema?.fields ?? []) {
      fieldDescriptions[f.name] = f.description ?? '';
    }
    return {
      entityName: resource.name,
      fullPath: joinDataPath(folderPath, resource.path),
      fieldDescriptions,
    };
  });
}

/** Apply a batch of domains for one entity into the store. */
function applyEntityDomains(
  set: SetFn,
  domains: DataFieldDomain[],
) {
  set((state) => {
    const nextDomains = [...state.dataFieldDomains, ...domains];
    return {
      dataFieldDomains: nextDomains,
      dataDomainsString: computeDataDomainsString(nextDomains),
    };
  });
}

/**
 * Load CSVs and compute field domains, offloading to a Web Worker when
 * available. Falls back to main-thread computation if the worker fails
 * to initialize (e.g. due to CSP restrictions or missing browser support).
 */
async function loadDomainsFromCSVs(set: SetFn, dp: DataPackage, fetchOptions?: RequestInit) {
  const resources = buildResourceInputs(dp);
  if (!resources) {
    console.warn('DataPackage has no udi:path — skipping CSV domain loading');
    return;
  }

  try {
    await loadDomainsViaWorker(set, resources, fetchOptions);
  } catch {
    // Worker failed to start — fall back to main thread
    await loadDomainsMainThread(set, resources, fetchOptions);
  }
}

/** Offload domain computation to a dedicated Web Worker. */
function loadDomainsViaWorker(
  set: SetFn,
  resources: ReturnType<typeof buildResourceInputs> & {},
  fetchOptions?: RequestInit,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('../workers/domainWorker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch (e) {
      reject(e);
      return;
    }

    // RequestInit may contain non-cloneable values (e.g. AbortSignal).
    // Extract only the serializable subset for the worker.
    const serializableFetchOptions = fetchOptions
      ? { headers: fetchOptions.headers, credentials: fetchOptions.credentials, mode: fetchOptions.mode } as RequestInit
      : undefined;

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

    worker.postMessage({
      type: 'compute',
      resources,
      fetchOptions: serializableFetchOptions,
    });
  });
}

/** Main-thread fallback: same logic as the original loadDomainsFromCSVs. */
async function loadDomainsMainThread(
  set: SetFn,
  resources: ReturnType<typeof buildResourceInputs> & {},
  fetchOptions?: RequestInit,
) {
  for (const resource of resources) {
    try {
      const { loadCSV } = await import('arquero');
      const loadOptions: Record<string, unknown> = {};
      if (resource.fullPath.endsWith('.tsv')) loadOptions.delimiter = '\t';
      if (fetchOptions) loadOptions.fetch = fetchOptions;
      const table = await loadCSV(resource.fullPath, loadOptions);
      const cols = table.columnNames();
      const domains: DataFieldDomain[] = [];
      for (const col of cols) {
        const series = table.array(col);
        const isNumeric = series.every((v: any) => v == null || !isNaN(+v));
        if (isNumeric) {
          const stats = table
            .rollup({
              min: `(d) => op.min(d["${col}"])`,
              max: `(d) => op.max(d["${col}"])`,
            })
            .objects()[0] as any;
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
      console.error(`Failed to load data for ${resource.entityName}:`, e);
    }
  }
}

function jsonClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
