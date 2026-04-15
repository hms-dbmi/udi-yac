/**
 * Join a base path (udi:path) with a resource path, handling:
 * - Base with or without trailing slash
 * - Resource with or without leading slash
 * - HTTP(S) URLs and local relative paths
 */
export function joinDataPath(basePath: string, resourcePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const resource = resourcePath.startsWith('/') ? resourcePath.slice(1) : resourcePath;
  return `${base}/${resource}`;
}
