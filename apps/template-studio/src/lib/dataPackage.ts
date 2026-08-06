/**
 * Loading a sample data package into the shared toolkit data store.
 *
 * Mirrors what `packages/chat`'s dataPackageStore does: build `SourceSpec`s from
 * the Frictionless `resources`, hand them to `loadDataPackage`, and build a
 * `sourceResolver` map so UDIVis fetches from the app's served `/data` path
 * rather than whatever URL the resolved spec happens to carry.
 */
import { loadDataPackage, type SourceSpec } from 'udi-toolkit/react';

interface Resource {
  name: string;
  path: string;
  schema?: { fields?: { name: string; description?: string }[] };
  'udi:row_count'?: number;
}

interface RawDataPackage {
  name?: string;
  resources?: Resource[];
  'udi:path'?: string;
}

/** Join a datapackage's `udi:path` with a resource path, tolerating `./` forms. */
export function joinDataPath(folder: string, file: string): string {
  const normalized = folder.replace(/^\.\//, '/').replace(/\/?$/, '/');
  return `${normalized}${file.replace(/^\.?\//, '')}`;
}

export interface LoadedDataPackage {
  /** Entity name -> resolved URL, passed to UDIVis as `sourceResolver`. */
  sourceResolver: Record<string, string>;
  entityNames: string[];
}

/**
 * Fetch a datapackage descriptor, turning the two failure modes that actually
 * happen in dev into messages that say what to do about them.
 */
async function fetchDataPackage(url: string): Promise<RawDataPackage> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    // A bare `TypeError: Failed to fetch` means the request never completed —
    // almost always the dev server having been stopped while the tab stayed open.
    throw new Error(
      `cannot reach the dev server for ${url} — is \`pnpm dev:template-studio\` ` +
        `still running? (${(err as Error).message})`,
    );
  }

  if (!response.ok) {
    throw new Error(`failed to fetch ${url} (HTTP ${response.status})`);
  }

  // Vite's SPA fallback answers unknown paths with index.html and a 200, so a
  // missing sample-data directory looks like success until JSON.parse blows up
  // on "<!doctype html>". Detect it here and name the actual problem.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error(
      `${url} did not return JSON (got ${contentType || 'no content-type'}). ` +
        `The sample data is probably not synced — run ` +
        `\`pnpm --filter udi-template-studio sync-data\`.`,
    );
  }

  return (await response.json()) as RawDataPackage;
}

export async function loadStudioDataPackage(url: string): Promise<LoadedDataPackage> {
  const dp = await fetchDataPackage(url);
  const folder = dp['udi:path'] ?? '';

  // Skip empty resources: the toolkit would fetch and parse a zero-row table for
  // no benefit, and chat filters them out the same way.
  const resources = (dp.resources ?? []).filter((r) => (r['udi:row_count'] ?? 1) > 0);

  const sources: SourceSpec[] = resources.map((resource) => {
    const fieldDescriptions: Record<string, string> = {};
    for (const field of resource.schema?.fields ?? []) {
      fieldDescriptions[field.name] = field.description ?? '';
    }
    return {
      name: resource.name,
      url: joinDataPath(folder, resource.path),
      fieldDescriptions,
    };
  });

  const sourceResolver: Record<string, string> = {};
  for (const source of sources) sourceResolver[source.name] = source.url;

  await loadDataPackage(sources, {
    onError: (entityName, message) =>
      console.error(`[template-studio] failed to load ${entityName}: ${message}`),
  });

  return { sourceResolver, entityNames: sources.map((s) => s.name) };
}
