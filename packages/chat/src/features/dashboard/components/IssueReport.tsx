import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useApiConfig,
  useConversationStore,
  useDashboardStore,
  useDataFiltersStore,
  useGlobal,
  useGlobalStore,
  useTracker,
  type ApiConfig,
} from '@/app/UDIChatContext';
import type { IssueReportSource } from '@/stores/globalStore';
import { postIssueReport } from '../api/issueReport';
import { currentSessionExport } from '../utils/dashboardSerialization';

interface IssueReportFormProps {
  apiConfig: ApiConfig;
  draft: string;
  source: IssueReportSource;
  /** Read at send time, so the report carries the session as it is then. */
  getSession: () => unknown;
  getConversationId: () => string | null;
  /** Cancel, or Close after sending. */
  onDone: () => void;
  onEvent?: ReturnType<typeof useTracker> | undefined;
}

type Status =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent'; reference: string | null }
  | { state: 'error'; message: string };

/**
 * The report itself: the user's note, an optional contact, and Send.
 *
 * Takes everything as props, with no store or context reads, because the crash
 * screen renders it too — from the ErrorBoundary, which sits outside every
 * provider.
 */
export function IssueReportForm({
  apiConfig,
  draft,
  source,
  getSession,
  getConversationId,
  onDone,
  onEvent,
}: IssueReportFormProps) {
  const [description, setDescription] = useState(draft);
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const descriptionId = useId();
  const contactId = useId();

  if (status.state === 'sent') {
    return (
      <div className="udi:space-y-3 udi:text-sm">
        <p role="status">
          Thanks, your report was sent to the development team.
          {status.reference && (
            <>
              {' '}
              Reference: <code>{status.reference}</code>
            </>
          )}
        </p>
        <div className="udi:flex udi:justify-end">
          <Button size="sm" onClick={onDone}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const note = description.trim();
    const reply = contact.trim();
    if (!note) return;
    setStatus({ state: 'sending' });
    try {
      const { traceId } = await postIssueReport(apiConfig, getConversationId(), {
        description: note,
        ...(reply ? { contact: reply } : {}),
        source,
        session: getSession(),
      });
      setStatus({ state: 'sent', reference: traceId ? traceId.slice(0, 8) : null });
      onEvent?.('issue_report_submitted', { source, hasContact: reply !== '' });
    } catch (err) {
      setStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Failed to send the report',
      });
      onEvent?.('issue_report_failed', { source });
    }
  };

  const sending = status.state === 'sending';
  return (
    <form onSubmit={send} className="udi:space-y-3 udi:text-left">
      <div className="udi:space-y-1.5">
        <Label htmlFor={descriptionId}>What went wrong?</Label>
        <Textarea
          id={descriptionId}
          required
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="udi:max-h-60"
        />
      </div>
      <div className="udi:space-y-1.5">
        <Label htmlFor={contactId}>Contact (optional)</Label>
        <Input
          id={contactId}
          maxLength={200}
          placeholder="Email or name, if you'd like a reply"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </div>
      <p className="udi:text-xs udi:text-muted-foreground">
        Sends your note and this session (the same file <em>Export session</em> saves) to the
        development team.
      </p>
      {status.state === 'error' && (
        <p role="alert" className="udi:text-xs udi:text-destructive">
          {status.message}
        </p>
      )}
      <div className="udi:flex udi:justify-end udi:gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={sending || !description.trim()}>
          {sending ? 'Sending…' : 'Send report'}
        </Button>
      </div>
    </form>
  );
}

/**
 * The Report an issue dialog, opened through the global store by the Session
 * menu and by the agent's `OfferIssueReport`. Mounted once, by UDIChat, when
 * the host switched issue reporting on.
 */
export function IssueReportDialog() {
  const { open, draft, source } = useGlobal((s) => s.issueReport);
  const globalStore = useGlobalStore();
  const conversationStore = useConversationStore();
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const apiConfig = useApiConfig();
  const trackEvent = useTracker();

  useEffect(() => {
    if (open) trackEvent('issue_report_opened', { source });
  }, [open, source, trackEvent]);

  const close = () => globalStore.getState().closeIssueReport();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="udi:sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>Tell the development team what went wrong.</DialogDescription>
        </DialogHeader>
        {/* Mounted per opening, so each report starts from its own draft. */}
        {open && (
          <IssueReportForm
            apiConfig={apiConfig}
            draft={draft}
            source={source}
            getSession={() =>
              currentSessionExport(
                conversationStore.getState(),
                dashboardStore.getState(),
                dataFiltersStore.getState(),
              )
            }
            getConversationId={() => conversationStore.getState().conversationId}
            onDone={close}
            onEvent={trackEvent}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
