import { useCallback } from 'react';
import { clearAllSelections } from 'udi-toolkit/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Plus } from 'lucide-react';
import {
  useConversationStore,
  useDashboardStore,
  useMemoryBankStore,
  useDataFiltersStore,
} from '@/app/UDIChatContext';

const CONVERSATION_FILES = [
  'filter/simple.json',
  'filter/sample_simple.json',
  'filter/donor_scatter.json',
  'filter/donor_scatter_bar.json',
  'filter/cross_entity.json',
  'filter/interval_and_point.json',
  'filter/age_race.json',
  'filter/age_race_modified.json',
  'filter/tall_heavy.json',
  'filter/age_death.json',
  'filter/cross_entity_age_death.json',
  'filter/users_filter_broken.json',
  'paper/filter_to_adults.json',
  'paper/filter_to_death.json',
  'paper/filter_to_death_correct.json',
  'chi/penguins.json',
  'chi/case_penguin.json',
  'chi/case_hubmap_in_progress.json',
  'chi/case_hubmap_in_progress2.json',
  'chi/teaser.json',
  'chi/teaser2.json',
  'chi/video_start.json',
  'VIS26/test.json',
];

function stripExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, '');
}

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

  const handleLoad = useCallback(
    async (filename: string) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sessions/${filename}`);
        if (!res.ok) return;
        const data = await res.json();
        const messages = Array.isArray(data) ? data : data.messages;
        if (!Array.isArray(messages)) return;
        // Reset state before loading
        dashboardStore.getState().clearAllVisualizations();
        void clearAllSelections();
        memoryBankStore.getState().clearMemoryBank();
        dataFiltersStore.getState().resetFilters();
        conversationStore.getState().loadConversation(messages);
      } catch {
        /* silently fail */
      }
    },
    [conversationStore, dashboardStore, memoryBankStore, dataFiltersStore],
  );

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
      <Separator className="udi:my-1" />
      <p className="udi:px-3 udi:py-1 udi:text-[10px] udi:font-medium udi:text-muted-foreground udi:uppercase udi:tracking-wider">
        Saved Sessions
      </p>
      <div className="udi:flex-1 udi:overflow-y-auto udi:px-1">
        {CONVERSATION_FILES.map((file) => (
          <button
            key={file}
            className="udi:text-xs udi:text-left udi:text-foreground udi:hover:bg-muted udi:rounded udi:px-2 udi:py-1.5 udi:w-full udi:truncate"
            onClick={() => handleLoad(file)}
          >
            {stripExtension(file)}
          </button>
        ))}
      </div>
    </div>
  );
}
