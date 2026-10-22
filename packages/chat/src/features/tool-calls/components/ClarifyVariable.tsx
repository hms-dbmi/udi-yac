import { useConversation } from '@/app/UDIChatContext';
import { MarkdownText } from '@/components/MarkdownText';
import { QuestionSequence } from '@/components/QuestionSequence';
import type { ClarifyVariableArgs } from '../types';

interface ClarifyVariableProps extends ClarifyVariableArgs {
  messageIndex?: number;
  onSelectSuggestion?: (value: string) => void;
}

export function ClarifyVariable({
  message,
  ambiguous_variables,
  messageIndex,
  onSelectSuggestion,
}: ClarifyVariableProps) {
  // Answered once the user has said anything after this message — through the
  // questions below or the chat input. Derived from the conversation rather
  // than local state so a restored session doesn't re-open old questions.
  const answered = useConversation(
    (s) =>
      messageIndex != null && s.messages.slice(messageIndex + 1).some((m) => m.role === 'user'),
  );

  const questions = ambiguous_variables.map((v) => ({
    question: `Which “${v.query_term}” variable?`,
    options: v.candidates.map((c) => ({
      value: `${c.field_name} (${c.entity})`,
      label: c.field_name,
      badge: c.entity,
      description: c.description,
    })),
  }));

  // One line per question, so the user's reply bubble reads as a compact
  // question/answer summary.
  const submit = (answers: (string | null)[]) =>
    onSelectSuggestion?.(
      ambiguous_variables
        .map((v, i) => `${v.query_term}: ${answers[i] ?? 'no preference'}`)
        .join('\n'),
    );

  return (
    <div className="udi:space-y-2 udi:p-1">
      <MarkdownText>{message}</MarkdownText>
      {!answered && questions.length > 0 && (
        <QuestionSequence questions={questions} onComplete={submit} />
      )}
    </div>
  );
}
