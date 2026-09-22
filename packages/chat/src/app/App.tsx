import { useEffect, useState } from 'react';
import { UDIChat } from '@/app/UDIChat';
import { env } from '@/app/env';

/**
 * Standalone dev/demo entry. Every knob is described once in `env.ts`, which
 * also generates `.env.example`, the README table, and `env.d.ts`.
 */
function App() {
  const initialSession = useInitialSession(env.initialSessionUrl);

  // Nothing to show yet, and rendering early would be wrong rather than just
  // blank: `UDIChat` reads `initialSession == null` to decide whether to
  // restore the persisted layout, so a session that arrives afterwards would
  // restore the old dashboard first and overwrite it a tick later.
  if (initialSession === 'pending') return null;

  return (
    <div className="h-screen">
      <UDIChat
        apiBaseUrl={env.apiBaseUrl}
        remotePackage={env.remotePackage}
        dataPackagePath={env.dataPackagePath}
        requireApiKey={env.requireApiKey}
        model={env.model}
        readOnly={env.readOnly}
        initialSession={initialSession}
      />
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
