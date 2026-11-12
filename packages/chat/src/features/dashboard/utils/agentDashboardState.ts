import type { DashboardState } from '../stores/dashboardStore';
import type { MemoryBankState } from '../stores/memoryBankStore';
import { sortRowMajor } from './gridPacking';

/**
 * The dashboard as the agent reads it (`udiagent.dashboard`). The completions
 * request carries it because the transcript can't: it echoes every chart the
 * agent ever made, including the ones since closed.
 *
 * Charts are named by their `vizKey` (`{message index}-{tool call index}`),
 * which the agent maps to the ids it shows the model.
 */
export interface AgentDashboardState {
  /** Open charts in dashboard order: top to bottom, then left to right. */
  open: { key: string; tableView?: true; sortByTotal?: true }[];
  /** Closed charts, in the memory bank. */
  closed: string[];
}

export function agentDashboardState(
  dashboard: Pick<
    DashboardState,
    'layout' | 'activeVisualizations' | 'tableViewKeys' | 'sortedByTotalKeys'
  >,
  memoryBank: Pick<MemoryBankState, 'closedVisualizations'>,
): AgentDashboardState {
  const open = sortRowMajor(dashboard.layout.items)
    .filter(({ i }) => dashboard.activeVisualizations.has(i))
    .map(({ i: key }) => ({
      key,
      ...(dashboard.tableViewKeys.has(key) ? { tableView: true as const } : {}),
      ...(dashboard.sortedByTotalKeys.has(key) ? { sortByTotal: true as const } : {}),
    }));
  return { open, closed: [...memoryBank.closedVisualizations.keys()] };
}
