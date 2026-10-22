import { useConversation } from '@/app/UDIChatContext';
import { MarkdownText } from '@/components/MarkdownText';
import { QuestionSequence } from '@/components/QuestionSequence';
import type { ClarifyVariableArgs } from '../types';

interface ClarifyVariableProps {
  /** Every ClarifyVariable call in the message, asked as one sequence so a
   *  single reply answers them all. */
  clarifications: ClarifyVariableArgs[];
  messageIndex: number;
  onSelectSuggestion?: (value: string) => void;
}

export function ClarifyVariable({
  clarifications,
  messageIndex,
  onSelectSuggestion,
}: ClarifyVariableProps) {
  // Answered once the user has said anything after this message — through the
  // questions below or the chat input. Derived from the conversation rather
  // than local state so a restored session doesn't re-open old questions.
  const answered = useConversation((s) =>
    s.messages.slice(messageIndex + 1).some((m) => m.role === 'user'),
  );

  const variables = clarifications.flatMap((c) => c.ambiguous_variables);
  const questions = variables.map((v) => ({
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
      variables.map((v, i) => `${v.query_term}: ${answers[i] ?? 'no preference'}`).join('\n'),
    );

  return (
    <div className="udi:space-y-2 udi:p-1">
      {clarifications.map((c, i) => (
        <MarkdownText key={i}>{c.message}</MarkdownText>
      ))}
      {!answered && questions.length > 0 && (
        <QuestionSequence questions={questions} onComplete={submit} />
      )}
    </div>
  );
}
