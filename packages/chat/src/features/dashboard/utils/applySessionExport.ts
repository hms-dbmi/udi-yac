import type { StoreApi } from 'zustand';
import type { ConversationState } from '@/features/chat';
import type { DashboardState } from '../stores/dashboardStore';
import type { SessionExport } from './dashboardSerialization';

interface SessionTargetStores {
  conversation: StoreApi<ConversationState>;
  dashboard: StoreApi<DashboardState>;
}

/**
 * Replace the current conversation + dashboard with a parsed session export.
 *
 * Shared by the two ways a session arrives: the Session → Import action, and
 * the `initialSession` config prop. Keeping one applier means the seeded path
 * and the user-driven path cannot drift in how they order these calls — which
 * matters, because the order is load-bearing (see the grid comment below).
 *
 * `sourceFields` comes from the loaded data package and is what
 * `importDashboard` needs to re-inject interactivity into each spec, so this
 * must not run before the package is ready.
 */
export function applySessionExport(
  session: SessionExport,
  stores: SessionTargetStores,
  sourceFields: Record<string, string[]> | null,
): void {
  const conversation = stores.conversation.getState();
  conversation.loadConversation(session.conversation.messages);
  if (session.conversation.sessionUsage) {
    conversation.setSessionUsage(session.conversation.sessionUsage);
  }

  const dashboard = stores.dashboard.getState();
  // Apply grid config FIRST so the import's repack/pack runs against the right
  // cols. Falls back to current defaults if the export didn't carry a grid
  // block (older v2 exports).
  if (session.grid) {
    dashboard.setGridCols(session.grid.cols);
    dashboard.setGridRowHeight(session.grid.rowHeight);
  }
  dashboard.importDashboard(
    { visualizations: session.visualizations, layout: session.layout },
    sourceFields,
  );
}
