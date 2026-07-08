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
    <div className="flex min-h-0 flex-col px-3 py-2">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lightbulb className="h-3 w-3" />
        <span className="font-medium uppercase tracking-wider">Try an example</span>
      </div>
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {examplePrompts.map((prompt, i) => (
          <button
            key={i}
            className="rounded px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
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
