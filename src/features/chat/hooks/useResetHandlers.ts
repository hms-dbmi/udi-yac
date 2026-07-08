import { useCallback } from 'react';
import { useClearAllSelections } from 'udi-toolkit/react';
import {
  useConversationStore,
  useDashboardStore,
  useMemoryBankStore,
  useDataFiltersStore,
  useTracker,
} from '@/app/UDIChatContext';

/**
 * Bundles the "reset everything" action — clears the active conversation,
 * all active visualizations, selections, the closed-viz memory bank, and
 * all cross-chart filters.
 */
export function useResetHandlers(): { handleReset: () => void } {
  const conversationStore = useConversationStore();
  const dashboardStore = useDashboardStore();
  const memoryBankStore = useMemoryBankStore();
  const dataFiltersStore = useDataFiltersStore();
  const trackEvent = useTracker();
  // Stable hook-wrapped callback for clearing the shared Pinia selections.
  // Identity-stable across renders, so it composes cleanly into the
  // handleReset useCallback's deps.
  const clearAllSelections = useClearAllSelections();

  const handleReset = useCallback(() => {
    const conversationLength = conversationStore.getState().messages.length;
    conversationStore.getState().newConversation();
    dashboardStore.getState().clearAllVisualizations();
    // Brushes auto-clear via Vega when charts unmount above, but the
    // Pinia bookkeeping entries linger — drop them so they don't
    // accumulate across resets.
    void clearAllSelections();
    memoryBankStore.getState().clearMemoryBank();
    dataFiltersStore.getState().resetFilters();
    trackEvent('conversation_reset', { conversationLength });
  }, [
    conversationStore,
    dashboardStore,
    memoryBankStore,
    dataFiltersStore,
    trackEvent,
    clearAllSelections,
  ]);

  return { handleReset };
}
