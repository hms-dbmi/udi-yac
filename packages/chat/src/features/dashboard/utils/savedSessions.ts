import type { SessionExport } from './dashboardSerialization';

/** A session export the user saved in this browser, under a name. */
export interface SavedSession {
  id: string;
  name: string;
  savedAt: string;
  /** Stored as exported. Parsed with `parseSessionExport` on load, like a
   *  file import, so an entry written by an older build fails the same way. */
  session: SessionExport;
}

// ponytail: localStorage (~5 MB per origin, roughly 80 pcx-size sessions);
// move to IndexedDB if the quota bites.
const storageKey = (key: string) => `udi-yac:saved-sessions:${key}`;

function isSavedSession(v: unknown): v is SavedSession {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.savedAt === 'string' &&
    typeof r.session === 'object'
  );
}

/** Newest first. Unreadable storage (blocked, private mode, garbage) reads as
 *  empty: the list is a convenience, never worth an error. */
export function listSavedSessions(key: string): SavedSession[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey(key)) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isSavedSession) : [];
  } catch {
    return [];
  }
}

/** Throws when storage is full or unavailable: unlike a read, a failed save
 *  loses the user's work, so the caller has to say so. */
function write(key: string, sessions: SavedSession[]): SavedSession[] {
  localStorage.setItem(storageKey(key), JSON.stringify(sessions));
  return sessions;
}

export function saveSession(key: string, name: string, session: SessionExport): SavedSession[] {
  const entry: SavedSession = {
    id: crypto.randomUUID(),
    name,
    savedAt: new Date().toISOString(),
    session,
  };
  return write(key, [entry, ...listSavedSessions(key)]);
}

export function deleteSavedSession(key: string, id: string): SavedSession[] {
  return write(
    key,
    listSavedSessions(key).filter((s) => s.id !== id),
  );
}
