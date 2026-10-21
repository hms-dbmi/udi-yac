import type { StoreApi } from 'zustand';
import type { ConversationState } from '@/features/chat/stores/conversationStore';
import type { DashboardState } from '@/features/dashboard/stores/dashboardStore';
import type { DataFiltersState } from '@/features/dashboard/stores/dataFiltersStore';
import {
  currentSessionExport,
  type SessionExport,
} from '@/features/dashboard/utils/dashboardSerialization';

interface SnapshotStores {
  conversation: StoreApi<ConversationState>;
  dashboard: StoreApi<DashboardState>;
  dataFilters?: StoreApi<DataFiltersState>;
}

// Module-level singleton so the ErrorBoundary (which sits OUTSIDE
// UDIChatProvider and therefore can't read the stores via context) can still
// capture the current session state when something crashes. Populated
// synchronously during the provider's render — `useEffect` runs too late if
// the very first render throws.
let registered: SnapshotStores | null = null;

export function registerSnapshotSource(stores: SnapshotStores): void {
  // Skipped on the server: writing a module global during render leaks state
  // across requests on a shared SSR server (host portals render us on Node).
  // Nothing is lost — the session export this feeds is a client-only affordance.
  if (typeof document === 'undefined') return;
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
    return currentSessionExport(
      stores.conversation.getState(),
      stores.dashboard.getState(),
      stores.dataFilters?.getState(),
    );
  } catch {
    return null;
  }
}

/** The registered conversation's id, so a crash report lands in its trace session. */
export function currentConversationId(): string | null {
  try {
    return registered?.conversation.getState().conversationId ?? null;
  } catch {
    return null;
  }
}

/** Testing helper — drops the singleton between specs. */
export function __resetSnapshotRegistryForTests(): void {
  registered = null;
}
