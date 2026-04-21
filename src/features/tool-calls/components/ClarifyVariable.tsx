import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';
import type { ClarifyVariableArgs } from '../types';
import { MarkdownText } from '@/components/MarkdownText';

interface ClarifyVariableProps extends ClarifyVariableArgs {
  onSelectSuggestion?: (value: string) => void;
}

export function ClarifyVariable({
  message,
  ambiguous_variables,
  onSelectSuggestion,
}: ClarifyVariableProps) {
  const [submitted, setSubmitted] = useState(false);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [freeText, setFreeText] = useState('');

  const isSelected = (vIdx: number, fieldName: string, entity: string) =>
    selections[vIdx] === `${fieldName} (${entity})`;

  const allSelected =
    ambiguous_variables.length > 0 && ambiguous_variables.every((_, idx) => idx in selections);

  const trySubmit = useCallback(
    (nextSelections: Record<number, string>) => {
      const complete =
        ambiguous_variables.length > 0 &&
        ambiguous_variables.every((_, idx) => idx in nextSelections);
      if (!complete || submitted) return;
      setSubmitted(true);
      const parts = ambiguous_variables.map((v, idx) => `${v.query_term}: ${nextSelections[idx]}`);
      onSelectSuggestion?.(parts.join(', '));
    },
    [ambiguous_variables, submitted, onSelectSuggestion],
  );

  const toggleCandidate = useCallback(
    (vIdx: number, fieldName: string, entity: string) => {
      if (submitted) return;
      const value = `${fieldName} (${entity})`;
      const next = { ...selections };
      if (next[vIdx] === value) {
        delete next[vIdx];
      } else {
        next[vIdx] = value;
      }
      setSelections(next);
      trySubmit(next);
    },
    [submitted, selections, trySubmit],
  );

  const submitFreeText = useCallback(() => {
    if (submitted || !freeText.trim()) return;
    setSubmitted(true);
    onSelectSuggestion?.(freeText.trim());
  }, [submitted, freeText, onSelectSuggestion]);

  return (
    <div className="space-y-3 p-1">
      <MarkdownText>{message}</MarkdownText>

      {ambiguous_variables.map((variable, vIdx) => (
        <div key={vIdx} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Select the correct &ldquo;{variable.query_term}&rdquo; variable:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {variable.candidates.map((candidate, cIdx) => (
              <Button
                key={cIdx}
                variant={
                  isSelected(vIdx, candidate.field_name, candidate.entity) ? 'default' : 'outline'
                }
                size="sm"
                disabled={submitted}
                className="h-auto py-1.5 px-2.5 text-left"
                onClick={() => toggleCandidate(vIdx, candidate.field_name, candidate.entity)}
              >
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{candidate.field_name}</span>
                    <Badge
                      variant={
                        isSelected(vIdx, candidate.field_name, candidate.entity)
                          ? 'secondary'
                          : 'outline'
                      }
                      className="text-[10px] px-1 py-0"
                    >
                      {candidate.entity}
                    </Badge>
                  </div>
                  {candidate.description && (
                    <p className="text-[10px] font-normal text-muted-foreground mt-0.5">
                      {candidate.description}
                    </p>
                  )}
                </div>
              </Button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Input
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Or type your own response..."
          className="text-xs h-8"
          disabled={submitted || allSelected}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitFreeText();
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={submitted || !freeText.trim()}
          onClick={submitFreeText}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
