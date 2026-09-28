import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    <div className="udi:space-y-3 udi:p-1">
      <MarkdownText>{message}</MarkdownText>

      {ambiguous_variables.map((variable, vIdx) => (
        <div key={vIdx} className="udi:space-y-1.5">
          <p className="udi:text-xs udi:font-medium udi:text-muted-foreground">
            Select the correct &ldquo;{variable.query_term}&rdquo; variable:
          </p>
          <div className="udi:flex udi:flex-wrap udi:gap-1.5">
            {variable.candidates.map((candidate, cIdx) => (
              <Button
                key={cIdx}
                variant={
                  isSelected(vIdx, candidate.field_name, candidate.entity) ? 'default' : 'outline'
                }
                size="sm"
                disabled={submitted}
                className="udi:h-auto udi:py-1.5 udi:px-2.5 udi:text-left udi:whitespace-normal udi:max-w-full"
                onClick={() => toggleCandidate(vIdx, candidate.field_name, candidate.entity)}
              >
                <div className="udi:min-w-0">
                  <div className="udi:flex udi:items-center udi:gap-1">
                    <span className="udi:text-xs">{candidate.field_name}</span>
                    <Badge
                      variant={
                        isSelected(vIdx, candidate.field_name, candidate.entity)
                          ? 'secondary'
                          : 'outline'
                      }
                      className="udi:text-[10px] udi:px-1 udi:py-0"
                    >
                      {candidate.entity}
                    </Badge>
                  </div>
                  {candidate.description && (
                    <p className="udi:text-[10px] udi:font-normal udi:text-muted-foreground udi:mt-0.5">
                      {candidate.description}
                    </p>
                  )}
                </div>
              </Button>
            ))}
          </div>
        </div>
      ))}

      <div className="udi:flex udi:items-center udi:gap-2">
        <Input
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Or type your own response..."
          className="udi:text-xs udi:h-8"
          disabled={submitted || allSelected}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitFreeText();
            }
          }}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="udi:h-8 udi:w-8 udi:shrink-0"
                disabled={submitted || !freeText.trim()}
                onClick={submitFreeText}
              />
            }
          >
            <Send className="udi:h-3.5 udi:w-3.5" />
          </TooltipTrigger>
          <TooltipContent>Send response</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
