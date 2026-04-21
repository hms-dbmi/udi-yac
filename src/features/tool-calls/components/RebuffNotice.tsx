import { Button } from '@/components/ui/button';
import { MarkdownText } from '@/components/MarkdownText';

interface RebuffNoticeProps {
  message: string;
  suggestions: string[];
  onSelectSuggestion?: (suggestion: string) => void;
}

export function RebuffNotice({ message, suggestions, onSelectSuggestion }: RebuffNoticeProps) {
  return (
    <div className="px-2 pb-2">
      <MarkdownText className="mb-2">{message}</MarkdownText>
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1 text-muted-foreground">
            Try one of these instead:
          </p>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((sug, i) => (
              <Button
                key={i}
                variant="outline"
                className="text-xs text-wrap w-full"
                onClick={() => onSelectSuggestion?.(sug)}
              >
                {sug}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
