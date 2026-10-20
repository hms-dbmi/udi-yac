import { useEffect, useState } from 'react';
import { UDIChat } from '@/app/UDIChat';
import { env } from '@/app/env';
import catalog from '../../../../sample-data/catalog.json';

/** A public data package and its predefined sessions, from
 *  `sample-data/catalog.json`. Paths are relative to the synced `data/` dir. */
interface CatalogPackage {
  id: string;
  title: string;
  description: string;
  datapackage: string;
  sessions: { id: string; title: string; description: string; path: string }[];
}

const PACKAGES: CatalogPackage[] = catalog.packages;

interface Selection {
  /** The catalog entry in use, when there is one: drives the switcher and
   *  the saved-sessions key. */
  pkg?: CatalogPackage;
  sessionId?: string;
  dataPackagePath: string;
  remotePackage?: string;
  initialSessionUrl?: string;
}

/**
 * `?package=<id>&session=<id>` picks a package and a predefined session from
 * the catalog. Without it the env config applies unchanged, so `pnpm dev:chat`
 * and `.env.local` work as they always have; the env package is still matched
 * against the catalog by URL so the switcher and saved sessions know it.
 *
 * Switching package is a page load, never a prop change: the toolkit's data
 * sources and the chat's field domains only accumulate, so a package swapped
 * in place would keep the old one's tables.
 */
function selectFromUrl(): Selection {
  // BASE_URL is a path, so it needs the page URL to become a base.
  const dataDir = new URL(`${import.meta.env.BASE_URL}data/`, location.href);
  const resolve = (path: string) => new URL(path, dataDir).href;
  const params = new URLSearchParams(location.search);
  const packageId = params.get('package');
  const pkg = packageId ? PACKAGES.find((p) => p.id === packageId) : undefined;
  if (packageId && !pkg) {
    console.warn(`[udi-yac] unknown ?package=${packageId}; using the configured package`);
  }

  if (!pkg) {
    const envUrl = new URL(env.dataPackagePath, location.href).href;
    return {
      pkg: env.remotePackage ? undefined : PACKAGES.find((p) => resolve(p.datapackage) === envUrl),
      dataPackagePath: env.dataPackagePath,
      remotePackage: env.remotePackage,
      initialSessionUrl: env.initialSessionUrl,
    };
  }

  const sessionId = params.get('session') ?? undefined;
  const session = pkg.sessions.find((s) => s.id === sessionId);
  if (sessionId && !session) {
    console.warn(`[udi-yac] unknown ?session=${sessionId} for ${pkg.id}; starting empty`);
  }
  return {
    pkg,
    sessionId: session?.id,
    dataPackagePath: resolve(pkg.datapackage),
    initialSessionUrl: session && resolve(session.path),
  };
}

function open(packageId: string, sessionId?: string) {
  const params = new URLSearchParams({ package: packageId });
  if (sessionId) params.set('session', sessionId);
  location.assign(`?${params}`);
}

/** Package and session pickers above the chat. Each choice is a page load. */
function CatalogBar({ pkg, sessionId }: { pkg?: CatalogPackage; sessionId?: string }) {
  const select =
    'udi:h-7 udi:rounded-md udi:border udi:border-input udi:bg-background udi:px-2 udi:text-xs';
  return (
    <div className="udi:flex udi:items-center udi:gap-2 udi:px-3 udi:py-1.5 udi:border-b udi:bg-background udi:text-xs udi:text-foreground">
      <span className="udi:font-semibold">YAC</span>
      <select
        aria-label="Dataset"
        className={select}
        value={pkg?.id ?? ''}
        onChange={(e) => open(e.target.value)}
      >
        {!pkg && (
          <option value="" disabled>
            Configured dataset
          </option>
        )}
        {PACKAGES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      {pkg && pkg.sessions.length > 0 && (
        <select
          aria-label="Session"
          className={select}
          value={sessionId ?? ''}
          onChange={(e) => open(pkg.id, e.target.value || undefined)}
        >
          <option value="">New session</option>
          {pkg.sessions.map((s) => (
            <option key={s.id} value={s.id} title={s.description}>
              {s.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * Standalone dev/demo entry. Every knob is described once in `env.ts`, which
 * also generates `.env.example`, the README table, and `env.d.ts`.
 */
function App() {
  const [selection] = useState(selectFromUrl);
  const initialSession = useInitialSession(selection.initialSessionUrl);

  // Nothing to show yet, and rendering early would be wrong rather than just
  // blank: `UDIChat` reads `initialSession == null` to decide whether to
  // restore the persisted layout, so a session that arrives afterwards would
  // restore the old dashboard first and overwrite it a tick later.
  if (initialSession === 'pending') return null;

  return (
    // `udi-yac` scopes the design tokens, which the bar needs as well.
    <div className="udi-yac udi:h-screen udi:flex udi:flex-col">
      <CatalogBar pkg={selection.pkg} sessionId={selection.sessionId} />
      <div className="udi:flex-1 udi:min-h-0">
        <UDIChat
          apiBaseUrl={env.apiBaseUrl}
          remotePackage={selection.remotePackage}
          dataPackagePath={selection.dataPackagePath}
          requireApiKey={env.requireApiKey}
          model={env.model}
          readOnly={env.readOnly}
          initialSession={initialSession}
          savedSessionsKey={selection.pkg?.id}
        />
      </div>
    </div>
  );
}

/**
 * Fetch the session export `VITE_UDI_INITIAL_SESSION` points at.
 *
 * The prop takes a parsed value rather than a URL — a library consumer already
 * has the JSON in hand — so the standalone app is where the file gets read.
 * The value is handed over unvalidated on purpose: `validateConfig` rejects a
 * malformed one into the ErrorBoundary, which names the offending field.
 *
 * Returns `'pending'` while the fetch is in flight, `undefined` when there is
 * no URL to load or the load failed.
 */
function useInitialSession(url: string | undefined): unknown {
  const [session, setSession] = useState<unknown>('pending');

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const json: unknown = await response.json();
        if (!cancelled) setSession(json);
      } catch (e) {
        // A missing file shouldn't cost you the whole app: the dashboard just
        // starts empty, the way it does without the variable set at all.
        console.error(`[udi-yac] could not load VITE_UDI_INITIAL_SESSION (${url}):`, e);
        if (!cancelled) setSession(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return url ? session : undefined;
}

export default App;
