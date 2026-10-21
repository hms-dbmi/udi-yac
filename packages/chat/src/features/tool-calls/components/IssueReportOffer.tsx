import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownText } from '@/components/MarkdownText';
import { useGlobalStore, useIssueReporting } from '@/app/UDIChatContext';
import type { OfferIssueReportArgs } from '../types';

/**
 * The agent's offer to report a problem. The button opens the same dialog as
 * the Session menu, pre-filled with the agent's summary. Without issue
 * reporting (say, a session imported into a host that has it off) only the
 * message shows.
 */
export function IssueReportOffer({ message, summary }: OfferIssueReportArgs) {
  const enabled = useIssueReporting();
  const globalStore = useGlobalStore();
  return (
    <div className="udi:space-y-2 udi:px-2 udi:pb-2">
      <MarkdownText>{message}</MarkdownText>
      {enabled && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => globalStore.getState().openIssueReport(summary ?? '', 'chat')}
        >
          <Bug className="udi:h-3.5 udi:w-3.5 udi:mr-1.5" />
          Report issue
        </Button>
      )}
    </div>
  );
}
