import { useCallback } from 'react';
import {
  useConversationStore,
  useDashboardStore,
  useSelectionsStore,
  useMemoryBankStore,
  useDataFiltersStore,
} from '@/app/UDIChatContext';

/**
 * Bundles the "reset everything" action — clears the active conversation,
 * all pinned visualizations, selections, the closed-viz memory bank, and
 * all cross-chart filters.
 */
export function useResetHandlers(): { handleReset: () => void } {
  const conversationStore = useConversationStore();
  const dashboardStore = useDashboardStore();
  const selectionsStore = useSelectionsStore();
  const memoryBankStore = useMemoryBankStore();
  const dataFiltersStore = useDataFiltersStore();

  const handleReset = useCallback(() => {
    conversationStore.getState().newConversation();
    dashboardStore.getState().clearAllVisualizations();
    selectionsStore.getState().clearSelections();
    memoryBankStore.getState().clearMemoryBank();
    dataFiltersStore.getState().resetFilters();
  }, [conversationStore, dashboardStore, selectionsStore, memoryBankStore, dataFiltersStore]);

  return { handleReset };
}
