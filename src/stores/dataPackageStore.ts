import { createStore } from 'zustand/vanilla';
import type { DataFieldDomain, DataPackage, CategoricalDomain } from '@/types/dataPackage';

export interface DataPackageState {
  dataPackage: DataPackage | null;
  dataFieldDomains: DataFieldDomain[];
  loading: boolean;
  error: string | null;
  // Cached derived values (updated by fetchDataPackage, not recomputed per selector call)
  sourceFields: Record<string, string[]> | null;
  dataPackageString: string;
  dataDomainsString: string;
  fetchDataPackage: (path: string) => Promise<void>;
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

function computeDataPackageString(dp: DataPackage | null): string {
  if (!dp) return '';
  return JSON.stringify(removeVestigialInfo(dp));
}

function computeDataDomainsString(domains: DataFieldDomain[]): string {
  if (domains.length === 0) return '';
  return JSON.stringify(removeLongDomains(domains));
}

export function createDataPackageStore() {
  return createStore<DataPackageState>()((set) => ({
    dataPackage: null,
    dataFieldDomains: [],
    loading: false,
    error: null,
    sourceFields: null,
    dataPackageString: '',
    dataDomainsString: '',

    fetchDataPackage: async (path: string) => {
      set({ loading: true, error: null });
      try {
        const response = await fetch(path);
        const json = await response.json();
        if (json.resources && Array.isArray(json.resources)) {
          json.resources = json.resources.filter(
            (r: any) => r['udi:row_count'] && r['udi:row_count'] > 0,
          );
        }
        set({
          dataPackage: json,
          loading: false,
          sourceFields: computeSourceFields(json),
          dataPackageString: computeDataPackageString(json),
        });

        // Initialize data field domains by loading CSVs
        const folderPath = json['udi:path'];
        for (const resource of json.resources ?? []) {
          const entityName = resource.name;
          const dataPath = resource.path;
          const fullPath = `${folderPath}/${dataPath}`;
          const fieldDescriptions: Record<string, string> = {};
          for (const f of resource.schema?.fields ?? []) {
            fieldDescriptions[f.name] = f.description ?? '';
          }
          try {
            const { loadCSV } = await import('arquero');
            const loadOptions: any = {};
            if (fullPath.endsWith('.tsv')) loadOptions.delimiter = '\t';
            const table = await loadCSV(fullPath, loadOptions);
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
                  entity: entityName,
                  field: col,
                  type: 'interval',
                  fieldDescription: fieldDescriptions[col] ?? '',
                  domain: { min: stats.min, max: stats.max },
                });
              } else {
                domains.push({
                  entity: entityName,
                  field: col,
                  type: 'point',
                  fieldDescription: fieldDescriptions[col] ?? '',
                  domain: { values: Array.from(new Set(series)) as string[] },
                });
              }
            }
            set((state) => {
              const nextDomains = [...state.dataFieldDomains, ...domains];
              return {
                dataFieldDomains: nextDomains,
                dataDomainsString: computeDataDomainsString(nextDomains),
              };
            });
          } catch (e) {
            console.error(`Failed to load data for ${entityName}:`, e);
          }
        }
      } catch (e) {
        set({ error: String(e), loading: false });
      }
    },
  }));
}

function jsonClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
