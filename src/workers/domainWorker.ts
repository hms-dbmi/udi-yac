/**
 * Web Worker for computing data field domains from CSV/TSV files.
 *
 * Offloads the expensive CSV parsing + column-level type inference + domain
 * computation from the main thread. Receives resource metadata, loads the
 * CSVs via Arquero inside the worker, and posts back DataFieldDomain arrays.
 *
 * Message protocol:
 *   Main → Worker:  ComputeDomainsRequest  (one message to start)
 *   Worker → Main:  EntityDomainsResult     (one per resource, streamed)
 *   Worker → Main:  DoneResult | ErrorResult (termination)
 */

import { loadCSV } from 'arquero';
import type {
  ResourceInput,
  WorkerMessage,
  WorkerResponse,
  EntityDomainsResult,
  DoneResult,
  ErrorResult,
} from '@/types/domainWorker';
import type { DataFieldDomain } from '@/types/dataPackage';

// Worker global scope — `self` is typed via DOM lib; the cast avoids
// needing a separate tsconfig with the WebWorker lib.
const workerSelf = self as unknown as { onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null; postMessage: (msg: WorkerResponse) => void };

workerSelf.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;
  if (msg.type !== 'compute') return;

  for (const resource of msg.resources) {
    try {
      const domains = await computeEntityDomains(resource, msg.fetchOptions);
      const response: EntityDomainsResult = {
        type: 'entity-domains',
        entityName: resource.entityName,
        domains,
      };
      workerSelf.postMessage(response);
    } catch (e) {
      const response: ErrorResult = {
        type: 'error',
        entityName: resource.entityName,
        message: e instanceof Error ? e.message : String(e),
      };
      workerSelf.postMessage(response);
    }
  }

  workerSelf.postMessage({ type: 'done' } satisfies DoneResult);
};

async function computeEntityDomains(
  resource: ResourceInput,
  fetchOptions?: RequestInit,
): Promise<DataFieldDomain[]> {
  const loadOptions: Record<string, unknown> = {};
  if (resource.fullPath.endsWith('.tsv')) loadOptions.delimiter = '\t';
  if (fetchOptions) loadOptions.fetch = fetchOptions;

  const table = await loadCSV(resource.fullPath, loadOptions);
  const cols = table.columnNames();
  const domains: DataFieldDomain[] = [];

  for (const col of cols) {
    const series = table.array(col);
    const isNumeric = series.every((v: unknown) => v == null || !isNaN(+(v as number)));

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

  return domains;
}

// Types are exported from @/types/domainWorker
