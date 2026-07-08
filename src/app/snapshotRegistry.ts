import type { StoreApi } from 'zustand';
import type { ConversationState } from '@/features/chat/stores/conversationStore';
import type { DashboardState } from '@/features/dashboard/stores/dashboardStore';
import {
  buildSessionExport,
  type SessionExport,
} from '@/features/dashboard/utils/dashboardSerialization';

interface SnapshotStores {
  conversation: StoreApi<ConversationState>;
  dashboard: StoreApi<DashboardState>;
}

// Module-level singleton so the ErrorBoundary (which sits OUTSIDE
// UDIChatProvider and therefore can't read the stores via context) can still
// capture the current session state when something crashes. Populated
// synchronously during the provider's render — `useEffect` runs too late if
// the very first render throws.
let registered: SnapshotStores | null = null;

export function registerSnapshotSource(stores: SnapshotStores): void {
  registered = stores;
}

/**
 * Build a `SessionExport` from the most recently registered stores.
 *
 * Returns `null` if no provider has mounted yet, or if reading either store
 * throws (e.g. the dashboardStore is the very thing that crashed).
 */
export function captureCurrentSession(): SessionExport | null {
  const stores = registered;
  if (!stores) return null;
  try {
    const messages = stores.conversation.getState().messages;
    const dashboard = stores.dashboard.getState().exportDashboard();
    return buildSessionExport({ messages, dashboard });
  } catch {
    return null;
  }
}

/** Testing helper — drops the singleton between specs. */
export function __resetSnapshotRegistryForTests(): void {
  registered = null;
}
