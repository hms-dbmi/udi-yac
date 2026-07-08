import { useCallback, useRef, useState } from 'react';
import { Save, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  useDataPackage,
  useTracker,
} from '@/app/UDIChatContext';
import {
  buildSessionExport,
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
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const trackEvent = useTracker();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExport = useCallback(() => {
    const state = dashboardStore.getState();
    const conversation = conversationStore.getState();
    const messages = conversation.messages;
    const dashboard = state.exportDashboard();
    const payload: SessionExport = buildSessionExport({
      messages,
      dashboard,
      grid: { cols: state.gridCols, rowHeight: state.gridRowHeight },
      sessionUsage: conversation.sessionUsage,
    });
    saveBlob(JSON.stringify(payload, null, 2), `udi-session_${timestamp()}.json`);
    trackEvent('session_exported', {
      messageCount: messages.length,
      vizCount: dashboard.visualizations.length,
      itemCount: dashboard.layout.items.length,
    });
  }, [conversationStore, dashboardStore, trackEvent]);

  const handlePickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = parseSessionExport(JSON.parse(text));
        if (!parsed.ok) {
          setErrorMessage(parsed.error);
          return;
        }
        conversationStore.getState().loadConversation(parsed.value.conversation.messages);
        if (parsed.value.conversation.sessionUsage) {
          conversationStore.getState().setSessionUsage(parsed.value.conversation.sessionUsage);
        }
        const dashboard = dashboardStore.getState();
        // Apply grid config FIRST so the import's repack/pack runs against
        // the right cols. Falls back to current defaults if the export
        // didn't carry a grid block (older v2 exports).
        if (parsed.value.grid) {
          dashboard.setGridCols(parsed.value.grid.cols);
          dashboard.setGridRowHeight(parsed.value.grid.rowHeight);
        }
        dashboard.importDashboard(
          {
            visualizations: parsed.value.visualizations,
            layout: parsed.value.layout,
          },
          sourceFields,
        );
        trackEvent('session_imported', {
          messageCount: parsed.value.conversation.messages.length,
          vizCount: parsed.value.visualizations.length,
          itemCount: parsed.value.layout.items.length,
        });
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to read file');
      }
    },
    [conversationStore, dashboardStore, sourceFields, trackEvent],
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleFileChange}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" />}
        >
          <Save className="h-3.5 w-3.5" />
          Session
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-2" />
            Export session
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePickFile}>
            <Upload className="h-3.5 w-3.5 mr-2" />
            Import session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
