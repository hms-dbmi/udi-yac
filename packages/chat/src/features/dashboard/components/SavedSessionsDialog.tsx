import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SessionExport } from '../utils/dashboardSerialization';
import {
  deleteSavedSession,
  listSavedSessions,
  saveSession,
  type SavedSession,
} from '../utils/savedSessions';

/** Save the current session under a name, or load/delete one saved earlier,
 *  all in this browser's storage under `storageKey`. Mounted only while open,
 *  so each opening reads the list afresh. */
export function SavedSessionsDialog({
  storageKey,
  onClose,
  snapshot,
  onLoad,
}: {
  storageKey: string;
  onClose: () => void;
  snapshot: () => SessionExport;
  /** Gets the stored export unparsed: it goes through the same checks as a
   *  file import. */
  onLoad: (session: unknown) => void;
}) {
  const [sessions, setSessions] = useState(() => listSavedSessions(storageKey));
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const write = (change: () => SavedSession[]): boolean => {
    try {
      setSessions(change());
      setError(null);
      return true;
    } catch (e) {
      setError(
        `This browser would not store it (${e instanceof Error ? e.message : String(e)}). Export a file instead.`,
      );
      return false;
    }
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed && write(() => saveSession(storageKey, trimmed, snapshot()))) setName('');
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saved in this browser</DialogTitle>
          <DialogDescription>
            Only this browser can see these. Export a file to keep or share a session.
          </DialogDescription>
        </DialogHeader>
        <form className="udi:flex udi:gap-2" onSubmit={handleSave}>
          <Input
            aria-label="Session name"
            placeholder="Name this session"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Save
          </Button>
        </form>
        {error && (
          <p role="alert" className="udi:text-xs udi:text-destructive">
            {error}
          </p>
        )}
        {sessions.length === 0 ? (
          <p className="udi:text-xs udi:text-muted-foreground">Nothing saved yet.</p>
        ) : (
          <ul className="udi:flex udi:flex-col udi:gap-1 udi:max-h-64 udi:overflow-y-auto">
            {sessions.map((s) => (
              <li key={s.id} className="udi:flex udi:items-center udi:gap-2">
                <div className="udi:flex-1 udi:min-w-0">
                  <div className="udi:truncate">{s.name}</div>
                  <div className="udi:text-2xs udi:text-muted-foreground">
                    {new Date(s.savedAt).toLocaleString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    onLoad(s.session);
                  }}
                >
                  Load
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => write(() => deleteSavedSession(storageKey, s.id))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
