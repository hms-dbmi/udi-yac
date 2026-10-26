import type { IssueReportSource } from '@/stores/globalStore';
import { httpError } from '@/utils/httpError';

export interface IssueReportBody {
  description: string;
  contact?: string;
  source: IssueReportSource;
  /** The session export (on the crash screen, with an `error` block added). */
  session: unknown;
}

/**
 * Send a user's issue report to the agent, which records it in LangFuse under
 * the conversation's session — next to the traces of the turns it is about.
 */
export async function postIssueReport(
  config: { apiBaseUrl: string; authToken?: string | undefined },
  conversationId: string | null,
  body: IssueReportBody,
): Promise<{ traceId: string | null }> {
  const response = await fetch(`${config.apiBaseUrl}/v1/yac/issue_report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Only when we were actually given one — see queryLLM.
      ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
      ...(conversationId ? { 'X-Conversation-Id': conversationId } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await httpError(response);
  return (await response.json()) as { traceId: string | null };
}
