import { useEffect, useState } from 'react';
import { UDIChat } from 'udi-yac';
import catalog from '../../../../sample-data/catalog.json';
import { searchFor, selectFromSearch, type CatalogPackage } from '../lib/catalog';

const PACKAGES: CatalogPackage[] = catalog.packages;
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

const env = import.meta.env;
const bool = (raw: string | undefined, fallback: boolean) =>
  raw?.trim() ? !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase()) : fallback;

/**
 * The public site's app page: the chat library with a dataset and session
 * picker above it, driven by `sample-data/catalog.json` and the query string.
 * Switching dataset is a page load rather than a prop change: the toolkit's
 * data sources and the chat's field domains only accumulate, so a package
 * swapped in place would keep the old one's tables.
 */
export default function AppShell() {
  const [selection] = useState(() =>
    selectFromSearch(PACKAGES, location.search, new URL(`${BASE}app/data/`, location.href)),
  );
  const initialSession = useSession(selection.sessionUrl);
  const { pkg, sessionId } = selection;

  return (
    <div className="shell">
      <nav className="bar">
        <a href={BASE} className="brand">
          YAC
        </a>
        <select
          aria-label="Dataset"
          value={pkg.id}
          onChange={(e) => location.assign(searchFor(e.target.value))}
        >
          {PACKAGES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {pkg.sessions.length > 0 && (
          <select
            aria-label="Session"
            value={sessionId ?? ''}
            onChange={(e) => location.assign(searchFor(pkg.id, e.target.value || undefined))}
          >
            <option value="">New session</option>
            {pkg.sessions.map((s) => (
              <option key={s.id} value={s.id} title={s.description}>
                {s.title}
              </option>
            ))}
          </select>
        )}
        <a href={`${BASE}docs/using/`} className="docs">
          Docs
        </a>
      </nav>
      {/* Not rendered until the session is in: UDIChat restores the persisted
          layout when `initialSession` is absent, and a late session would
          then overwrite it. */}
      {initialSession !== 'pending' && (
        <main className="chat">
          <UDIChat
            apiBaseUrl={env.VITE_UDI_API_BASE_URL?.trim() || 'http://localhost:8007'}
            requireApiKey={bool(env.VITE_UDI_REQUIRE_API_KEY, true)}
            model={env.VITE_UDI_MODEL?.trim() || undefined}
            dataPackagePath={selection.dataPackageUrl}
            initialSession={initialSession}
            // A predefined session opens as a dashboard to look at; Explore
            // Data opens the chat. Only once it has loaded: a failed load
            // leaves nothing to look at.
            readOnly={initialSession !== undefined}
            savedSessionsKey={pkg.id}
            issueReporting={bool(env.VITE_UDI_ISSUE_REPORTING, false)}
          />
        </main>
      )}
    </div>
  );
}

/** The predefined session's export, `'pending'` while it loads, `undefined`
 *  when there is none or it failed (the dashboard then starts empty). */
function useSession(url: string | undefined): unknown {
  const [session, setSession] = useState<unknown>(url ? 'pending' : undefined);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .catch((e: unknown) => {
        console.error(`[udi-yac] could not load session ${url}:`, e);
        return undefined;
      })
      .then((json: unknown) => !cancelled && setSession(json));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return session;
}
