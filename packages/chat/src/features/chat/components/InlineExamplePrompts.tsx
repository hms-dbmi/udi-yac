import { Lightbulb } from 'lucide-react';
import { useConversation } from '@/app/UDIChatContext';
import { useExamplePrompts } from '../hooks/useExamplePrompts';

interface InlineExamplePromptsProps {
  apiBaseUrl: string;
  onExampleClick: (prompt: string) => void;
  isLoading: boolean;
}

/**
 * Renders the example prompts list inline in the chat area whenever the
 * conversation has no messages. Self-contained subscription so this
 * component does not drag MessageList/ChatPanel into re-rendering when
 * prompts load.
 */
export function InlineExamplePrompts({
  apiBaseUrl,
  onExampleClick,
  isLoading,
}: InlineExamplePromptsProps) {
  const messageCount = useConversation((s) => s.messages.length);
  const { examplePrompts } = useExamplePrompts(apiBaseUrl);

  if (messageCount > 0 || examplePrompts.length === 0) return null;

  return (
    <div className="udi:flex udi:min-h-0 udi:flex-col udi:px-3 udi:py-2">
      <div className="udi:mb-2 udi:flex udi:items-center udi:gap-1.5 udi:text-xs udi:text-muted-foreground">
        <Lightbulb className="udi:h-3 udi:w-3" />
        <span className="udi:font-medium udi:uppercase udi:tracking-wider">Try an example</span>
      </div>
      <div className="udi:flex udi:min-h-0 udi:flex-col udi:gap-1 udi:overflow-y-auto">
        {examplePrompts.map((prompt, i) => (
          <button
            key={i}
            className="udi:rounded udi:px-3 udi:py-2 udi:text-left udi:text-sm udi:text-foreground udi:hover:bg-muted udi:disabled:opacity-50"
            onClick={() => onExampleClick(prompt)}
            disabled={isLoading}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
