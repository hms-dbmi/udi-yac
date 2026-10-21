import { useCallback, useRef, useState } from 'react';
import { Bug, Save, Upload, Download, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { SavedSessionsDialog } from './SavedSessionsDialog';
import {
  currentSessionExport,
  parseSessionExport,
  type SessionExport,
} from '../utils/dashboardSerialization';

function saveBlob(content: string, name: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function timestamp(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export function SessionImportExportButton() {
  const conversationStore = useConversationStore();
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const globalStore = useGlobalStore();
  const issueReporting = useIssueReporting();
  const trackEvent = useTracker();
  const savedSessionsKey = useSavedSessionsKey();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  const snapshotSession = useCallback(
    (): SessionExport =>
      currentSessionExport(conversationStore.getState(), dashboardStore.getState()),
    [conversationStore, dashboardStore],
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
      );
      trackEvent('session_imported', {
        source,
        messageCount: parsed.value.conversation.messages.length,
        vizCount: parsed.value.visualizations.length,
        itemCount: parsed.value.layout.items.length,
      });
    },
    [conversationStore, dashboardStore, dataFiltersStore, sourceFields, trackEvent],
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

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="udi:hidden"
        onChange={handleFileChange}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="udi:h-7 udi:text-xs udi:gap-1.5" />
          }
        >
          <Save className="udi:h-3.5 udi:w-3.5" />
          Session
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleExport}>
            <Download className="udi:h-3.5 udi:w-3.5 udi:mr-2" />
            Export session
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePickFile}>
            <Upload className="udi:h-3.5 udi:w-3.5 udi:mr-2" />
            Import session
          </DropdownMenuItem>
          {savedSessionsKey && (
            <DropdownMenuItem onClick={() => setSavedOpen(true)}>
              <HardDrive className="udi:h-3.5 udi:w-3.5 udi:mr-2" />
              Saved in browser…
            </DropdownMenuItem>
          )}
          {issueReporting && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => globalStore.getState().openIssueReport('', 'menu')}>
                <Bug className="udi:h-3.5 udi:w-3.5 udi:mr-2" />
                Report an issue
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
  );
}
