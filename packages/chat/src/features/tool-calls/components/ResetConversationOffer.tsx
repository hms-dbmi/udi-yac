import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownText } from '@/components/MarkdownText';
import { useGlobalStore } from '@/app/UDIChatContext';
import type { ResetConversationArgs } from '../types';

/**
 * The agent's offer to start over. The live response opens the same
 * confirmation as the chat header's reset button; this is the way back to it.
 */
export function ResetConversationOffer({ message }: ResetConversationArgs) {
  const globalStore = useGlobalStore();
  return (
    <div className="udi:space-y-2 udi:px-2 udi:pb-2">
      <MarkdownText>{message}</MarkdownText>
      <Button
        variant="outline"
        size="sm"
        onClick={() => globalStore.getState().setResetConfirmOpen(true)}
      >
        <RotateCcw className="udi:h-3.5 udi:w-3.5 udi:mr-1.5" />
        Reset conversation…
      </Button>
    </div>
  );
}
