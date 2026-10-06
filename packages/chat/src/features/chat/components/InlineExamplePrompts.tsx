import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExamplePrompts } from '../hooks/useExamplePrompts';

interface InlineExamplePromptsProps {
  apiBaseUrl: string;
  onExampleClick: (prompt: string) => void;
  isLoading: boolean;
}

/**
 * Renders the example prompts as the chat's opening assistant bubble, always
 * first in the message list. Display only: it is not a conversation message,
 * so it never reaches the LLM or a saved session. Self-contained
 * subscription so prompt loading does not re-render MessageList.
 */
export function InlineExamplePrompts({
  apiBaseUrl,
  onExampleClick,
  isLoading,
}: InlineExamplePromptsProps) {
  const { examplePrompts } = useExamplePrompts(apiBaseUrl);

  if (examplePrompts.length === 0) return null;

  // Same bubble shell as an assistant MessageBubble; options styled like
  // ClarifyVariable's candidates.
  return (
    <div className="udi:flex udi:justify-start">
      <div className="udi:max-w-[85%] udi:min-w-0 udi:rounded-lg udi:bg-muted udi:px-3 udi:py-2">
        <p className="udi:mb-2 udi:flex udi:items-center udi:gap-1.5 udi:text-sm">
          <Lightbulb className="udi:h-3.5 udi:w-3.5 udi:shrink-0 udi:text-muted-foreground" />
          Try asking one of these:
        </p>
        <div className="udi:flex udi:flex-col udi:items-start udi:gap-1.5">
          {examplePrompts.map((prompt, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="udi:h-auto udi:max-w-full udi:whitespace-normal udi:px-2.5 udi:py-1.5 udi:text-left udi:font-normal"
              onClick={() => onExampleClick(prompt)}
              disabled={isLoading}
            >
              {prompt}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
