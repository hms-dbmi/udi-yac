import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Bug, Upload, Download, HardDrive } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useConversationStore,
  useDashboardStore,
  useDataFiltersStore,
  useDataPackage,
  useGlobalStore,
  useIssueReporting,
  useSavedSessionsKey,
  useTracker,
} from '@/app/UDIChatContext';
import { applySessionExport } from '../utils/applySessionExport';
import { SavedSessionsDialog } from '../components/SavedSessionsDialog';
import type { MenuAction } from '../types';
import {
  currentSessionExport,
  parseSessionExport,
  type SessionExport,
} from '../utils/dashboardSerialization';
import { saveBlob } from '@/lib/utils';

function timestamp(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** The Session menu's actions. `dialogs` (the file picker, saved sessions and
 *  import errors) has to be rendered somewhere that stays mounted: a menu's
 *  popup unmounts as soon as one of its items closes it. */
export function useSessionActions(): {
  items: MenuAction[];
  reportIssue: MenuAction | null;
  dialogs: ReactNode;
} {
  const conversationStore = useConversationStore();
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const cubeMeasureFields = useDataPackage((s) => s.cubeMeasureFields);
  const globalStore = useGlobalStore();
  const issueReporting = useIssueReporting();
  const trackEvent = useTracker();
  const savedSessionsKey = useSavedSessionsKey();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  const snapshotSession = useCallback(
    (): SessionExport =>
      currentSessionExport(
        conversationStore.getState(),
        dashboardStore.getState(),
        dataFiltersStore.getState(),
      ),
    [conversationStore, dashboardStore, dataFiltersStore],
  );

  const handleExport = useCallback(() => {
    const payload = snapshotSession();
    saveBlob(JSON.stringify(payload, null, 2), `udi-session_${timestamp()}.json`);
    trackEvent('session_exported', {
      messageCount: payload.conversation.messages.length,
      vizCount: payload.visualizations.length,
      itemCount: payload.layout.items.length,
    });
  }, [snapshotSession, trackEvent]);

  /** File import and browser-saved sessions both arrive unparsed. */
  const importSession = useCallback(
    (raw: unknown, source: 'file' | 'browser') => {
      const parsed = parseSessionExport(raw);
      if (!parsed.ok) {
        setErrorMessage(parsed.error);
        return;
      }
      applySessionExport(
        parsed.value,
        {
          conversation: conversationStore,
          dashboard: dashboardStore,
          dataFilters: dataFiltersStore,
        },
        sourceFields,
        cubeMeasureFields,
      );
      trackEvent('session_imported', {
        source,
        messageCount: parsed.value.conversation.messages.length,
        vizCount: parsed.value.visualizations.length,
        itemCount: parsed.value.layout.items.length,
      });
    },
    [
      conversationStore,
      dashboardStore,
      dataFiltersStore,
      sourceFields,
      cubeMeasureFields,
      trackEvent,
    ],
  );

  const handlePickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        importSession(JSON.parse(await file.text()), 'file');
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to read file');
      }
    },
    [importSession],
  );

  return {
    items: [
      { label: 'Export session', Icon: Download, onSelect: handleExport },
      { label: 'Import session', Icon: Upload, onSelect: handlePickFile },
      ...(savedSessionsKey
        ? [{ label: 'Saved in browser…', Icon: HardDrive, onSelect: () => setSavedOpen(true) }]
        : []),
    ],
    reportIssue: issueReporting
      ? {
          label: 'Report an issue',
          Icon: Bug,
          onSelect: () => globalStore.getState().openIssueReport('', 'menu'),
        }
      : null,
    dialogs: (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="udi:hidden"
          onChange={handleFileChange}
        />
        {savedSessionsKey && savedOpen && (
          <SavedSessionsDialog
            storageKey={savedSessionsKey}
            onClose={() => setSavedOpen(false)}
            snapshot={snapshotSession}
            onLoad={(raw) => importSession(raw, 'browser')}
          />
        )}
        <Dialog open={errorMessage !== null} onOpenChange={(o) => !o && setErrorMessage(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Could not import session</DialogTitle>
              <DialogDescription>{errorMessage}</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </>
    ),
  };
}
