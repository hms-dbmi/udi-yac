import { useCallback } from 'react';
import { clearAllSelections } from 'udi-toolkit/react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  useConversationStore,
  useDashboardStore,
  useMemoryBankStore,
  useDataFiltersStore,
} from '@/app/UDIChatContext';

export function ConversationList() {
  const conversationStore = useConversationStore();
  const dashboardStore = useDashboardStore();
  const memoryBankStore = useMemoryBankStore();
  const dataFiltersStore = useDataFiltersStore();

  const handleNew = useCallback(() => {
    conversationStore.getState().newConversation();
    dashboardStore.getState().clearAllVisualizations();
    void clearAllSelections();
    memoryBankStore.getState().clearMemoryBank();
    dataFiltersStore.getState().resetFilters();
  }, [conversationStore, dashboardStore, memoryBankStore, dataFiltersStore]);

  return (
    <div className="udi:flex udi:flex-col udi:h-full">
      <div className="udi:px-3 udi:py-2">
        <h3 className="udi:text-xs udi:font-medium udi:text-muted-foreground udi:uppercase udi:tracking-wider">
          Conversations
        </h3>
      </div>
      <div className="udi:px-2">
        <Button
          variant="ghost"
          size="sm"
          className="udi:w-full udi:justify-start udi:gap-2 udi:text-xs"
          onClick={handleNew}
        >
          <Plus className="udi:h-3.5 udi:w-3.5" />
          New Conversation
        </Button>
      </div>
    </div>
  );
}
