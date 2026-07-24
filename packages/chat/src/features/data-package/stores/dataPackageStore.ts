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
import { httpError } from '@/utils/httpError';
import {
  loadDataPackage,
  createRemoteBackend,
  setQueryBackend,
  type SourceSpec,
} from 'udi-toolkit/react';

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
  /** False when the package is served by a remote query backend — live
   *  (per-brush-tick) cross-filtering is unavailable; brushes commit on
   *  mouse-up with a server round-trip. */
  interactiveMode: boolean;
  /** True while a remote batched query round-trip is in flight. */
  remoteQueryPending: boolean;
  fetchDataPackage: (path: string, fetchOptions?: RequestInit) => Promise<void>;
  /** Load a server-side package: fetches introspected metadata from
   *  GET /v1/yac/metadata and routes all queries through POST /v1/yac/query
   *  instead of loading CSVs into the browser. */
  fetchRemotePackage: (
    apiBaseUrl: string,
    packageName: string,
    authToken?: string,
  ) => Promise<void>;
  setDataPackage: (
    dataPackage: DataPackage,
    precomputedDomains?: DataFieldDomain[],
    fetchOptions?: RequestInit,
  ) => Promise<void>;
  getDomainForField: (entity: string, field: string) => DataFieldDomain | undefined;
  isValidIntervalFilter: (entity: string, field: string) => ValidStatus;
  isValidPointFilter: (entity: string, field: string, values: unknown[]) => ValidStatus;
  getEntityRelationship: (originSource: string, targetSource: string) => EntityRelationship | null;
  /** Key columns of an entity — primary key, foreign keys, and udi:unique
   *  fields, in schema field order. Used by the table view's "relevant
   *  fields" mode so rows stay identifiable. */
  getKeyFields: (entity: string) => string[];
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
    interactiveMode: true,
    remoteQueryPending: false,

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

      // Sibling entities that both FK the same parent (star schema, e.g.
      // Event → Patient ← Surgery) share the parent's key domain, so the
      // two-hop relationship collapses to a single hop between their FK
      // columns — a shape the executors already support. Direct FKs keep
      // precedence; this only runs when both direct searches miss.
      // ponytail: first common parent in resource order wins; disambiguate
      // if a package ever has entities linked through multiple parents.
      const searchSharedParent = (origin: string, target: string) => {
        const fkTo = (source: string, parent: string) =>
          dp.resources
            .find((r) => r.name === source)
            ?.schema?.foreignKeys?.find((fk) => fk.reference.resource === parent) ?? null;
        for (const parent of dp.resources) {
          if (parent.name === origin || parent.name === target) continue;
          const originFk = fkTo(origin, parent.name!);
          const targetFk = fkTo(target, parent.name!);
          if (originFk && targetFk) {
            return {
              originKey: originFk.fields[originFk.fields.length - 1],
              targetKey: targetFk.fields[targetFk.fields.length - 1],
            };
          }
        }
        return null;
      };

      return (
        searchOneDirection(originSource, targetSource) ??
        searchOneDirection(targetSource, originSource, true) ??
        searchSharedParent(originSource, targetSource)
      );
    },

    getKeyFields: (entity: string): string[] => {
      const resource = get().dataPackage?.resources?.find((r) => r.name === entity);
      if (!resource?.schema) return [];
      const keys = new Set<string>(resource.schema.primaryKey ?? []);
      for (const fk of resource.schema.foreignKeys ?? []) {
        for (const field of fk.fields ?? []) keys.add(field);
      }
      for (const field of resource.schema.fields ?? []) {
        if ((field as Record<string, unknown>)['udi:unique'] === true) {
          keys.add(field.name);
        }
      }
      // Deterministic order: schema field order, then any PK/FK names that
      // aren't listed as fields (shouldn't happen, but keep them).
      const fieldOrder = (resource.schema.fields ?? []).map((f) => f.name);
      return [
        ...fieldOrder.filter((name) => keys.has(name)),
        ...[...keys].filter((name) => !fieldOrder.includes(name)),
      ];
    },

    setFilteredData: (entity: string, data: ExportRowSet) => {
      set((state) => {
        const next = new Map(state.filteredData);
        next.set(entity, data);
        return { filteredData: next };
      });
    },

    fetchRemotePackage: async (apiBaseUrl: string, packageName: string, authToken?: string) => {
      set({ loadingPhase: 'fetching', error: null });
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${authToken ?? 'dev'}`,
        };
        const response = await fetch(
          `${apiBaseUrl}/v1/yac/metadata?package=${encodeURIComponent(packageName)}`,
          { headers },
        );
        if (!response.ok) {
          throw await httpError(response);
        }
        const metadata = (await response.json()) as {
          dataSchema: DataPackage;
          dataDomains: DataFieldDomain[];
        };

        // Route all toolkit queries through the server BEFORE applying the
        // package, so no UDIVis render ever tries to fetch a CSV.
        const backend = await createRemoteBackend({
          url: `${apiBaseUrl}/v1/yac/query`,
          packageName,
          headers,
        });
        backend.subscribePending((pending) => set({ remoteQueryPending: pending }));
        await setQueryBackend(backend);
        set({ interactiveMode: false });

        // The introspected dataSchema IS a DataPackage descriptor and the
        // domains match DataFieldDomain — reuse the local pipeline, skipping
        // CSV domain computation.
        await get().setDataPackage(metadata.dataSchema, metadata.dataDomains);
      } catch (e) {
        set({ error: String(e), loadingPhase: 'error' });
      }
    },

    fetchDataPackage: async (path: string, fetchOptions?: RequestInit) => {
      set({ loadingPhase: 'fetching', error: null });
      try {
        // A previous session may have installed a remote backend.
        await setQueryBackend(null);
        set({ interactiveMode: true, remoteQueryPending: false });
        const response = await fetch(path, fetchOptions);
        if (!response.ok) {
          throw await httpError(response);
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
 * Delegate CSV fetching and domain computation to udi-toolkit's
 * loadDataPackage. udi-toolkit owns the parsed-table cache (so UDIVis
 * reuses the data instead of re-fetching) and runs the per-column domain
 * passes off the main thread in a Web Worker.
 */
async function loadDomainsFromCSVs(set: SetFn, dp: DataPackage, fetchOptions?: RequestInit) {
  const folderPath = dp['udi:path'];
  if (!folderPath) {
    console.warn('DataPackage has no udi:path — skipping CSV domain loading');
    return;
  }

  const sources: SourceSpec[] = (dp.resources ?? []).map((resource) => {
    const fieldDescriptions: Record<string, string> = {};
    for (const f of resource.schema?.fields ?? []) {
      fieldDescriptions[f.name] = f.description ?? '';
    }
    return {
      name: resource.name,
      url: joinDataPath(folderPath, resource.path),
      fieldDescriptions,
    };
  });

  if (sources.length === 0) return;

  await loadDataPackage(sources, {
    fetchOptions,
    onEntityDomains: (_entityName, domains) => applyEntityDomains(set, domains),
    onError: (entityName, message) => {
      console.error(`Failed to load data for ${entityName}:`, message);
    },
  });
}

function jsonClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
