import { useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { cn } from '@/lib/utils';

export interface QuestionOption {
  value: string;
  label: string;
  badge?: string;
  description?: string;
}

export interface SequenceQuestion {
  question: string;
  options: QuestionOption[];
}

interface QuestionSequenceProps {
  questions: SequenceQuestion[];
  /** Called once every question has an answer: an option's `value`, the
   *  reader's own text, or `null` when skipped. */
  onComplete: (answers: (string | null)[]) => void;
}

/** A sequence of single-select questions shown one at a time. Answering one
 *  moves on to the next unanswered question; the arrows revisit earlier ones. */
export function QuestionSequence({ questions, onComplete }: QuestionSequenceProps) {
  const [step, setStep] = useState(0);
  // `undefined` = not answered yet; `null` = skipped.
  const [answers, setAnswers] = useState<(string | null | undefined)[]>(() =>
    questions.map(() => undefined),
  );
  const [freeText, setFreeText] = useState('');

  const answer = (value: string | null) => {
    const next = answers.with(step, value);
    setAnswers(next);
    setFreeText('');
    const unanswered = next.indexOf(undefined);
    if (unanswered === -1) onComplete(next as (string | null)[]);
    else setStep(unanswered);
  };

  const current = questions[step];
  if (!current) return null;

  return (
    <div className="udi:rounded-lg udi:border udi:bg-background udi:p-1.5">
      <div className="udi:flex udi:items-center udi:gap-1 udi:px-1.5 udi:py-1">
        <p className="udi:flex-1 udi:text-sm udi:font-medium">{current.question}</p>
        {questions.length > 1 && (
          <div className="udi:flex udi:shrink-0 udi:items-center udi:text-xs udi:text-muted-foreground">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Previous question"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              <ChevronLeft />
            </Button>
            {step + 1} of {questions.length}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Next question"
              disabled={answers[step] === undefined || step === questions.length - 1}
              onClick={() => setStep(step + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>

      <ItemGroup className="udi:gap-0.5">
        {current.options.map((option, i) => (
          <Item
            key={i}
            size="xs"
            variant={answers[step] === option.value ? 'muted' : 'default'}
            className={cn(
              'udi:text-left udi:hover:bg-muted',
              answers[step] === option.value && 'udi:ring-1 udi:ring-primary/50',
            )}
            render={<button type="button" onClick={() => answer(option.value)} />}
          >
            <ItemMedia className="udi:size-5 udi:rounded udi:bg-muted udi:text-xs udi:text-muted-foreground">
              {i + 1}
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="udi:text-xs">
                {option.label}
                {option.badge && (
                  <Badge variant="outline" className="udi:text-2xs udi:px-1 udi:py-0">
                    {option.badge}
                  </Badge>
                )}
              </ItemTitle>
              {option.description && (
                <ItemDescription className="udi:text-2xs">{option.description}</ItemDescription>
              )}
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>

      <div className="udi:mt-1 udi:flex udi:items-center udi:gap-2 udi:border-t udi:px-1.5 udi:pt-1.5">
        <Pencil className="udi:size-3.5 udi:shrink-0 udi:text-muted-foreground" />
        <Input
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Something else"
          aria-label="Something else"
          className="udi:h-7 udi:text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && freeText.trim()) {
              e.preventDefault();
              answer(freeText.trim());
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={() => answer(null)}>
          Skip
        </Button>
      </div>
    </div>
  );
}
