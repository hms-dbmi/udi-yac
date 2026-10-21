/** A public data package and its predefined sessions, as listed in
 *  `sample-data/catalog.json`. Paths are relative to the data directory. */
export interface CatalogPackage {
  id: string;
  title: string;
  description: string;
  datapackage: string;
  sessions: { id: string; title: string; description: string; path: string }[];
}

export interface Selection {
  pkg: CatalogPackage;
  sessionId?: string;
  dataPackageUrl: string;
  sessionUrl?: string;
}

/**
 * The package and predefined session that `?package=<id>&session=<id>` asks
 * for. No package, or one the catalog doesn't list, opens the first entry; an
 * unknown session opens the package empty. Paths resolve against `dataDir`, so
 * an entry may also give an absolute URL.
 */
export function selectFromSearch(
  packages: CatalogPackage[],
  search: string,
  dataDir: URL,
  warn: (message: string) => void = console.warn,
): Selection {
  const params = new URLSearchParams(search);
  const packageId = params.get('package');
  let pkg = packages.find((p) => p.id === packageId);
  if (!pkg) {
    if (packageId) warn(`[udi-yac] unknown ?package=${packageId}; opening ${packages[0].id}`);
    pkg = packages[0];
  }
  const sessionId = params.get('session');
  const session = pkg.sessions.find((s) => s.id === sessionId);
  if (sessionId && !session) warn(`[udi-yac] unknown ?session=${sessionId} for ${pkg.id}`);
  return {
    pkg,
    sessionId: session?.id,
    dataPackageUrl: new URL(pkg.datapackage, dataDir).href,
    sessionUrl: session && new URL(session.path, dataDir).href,
  };
}

/** The query string that opens `packageId`, with a predefined session if given. */
export function searchFor(packageId: string, sessionId?: string): string {
  const params = new URLSearchParams({ package: packageId });
  if (sessionId) params.set('session', sessionId);
  return `?${params}`;
}
