import Markdown from 'react-markdown';
import type { FreeTextExplainArgs, TextSegment } from '@/types/toolCallArgs';

function segmentsToMarkdown(segments: TextSegment[]): string {
  return segments
    .map((seg) => {
      if (typeof seg === 'string') return seg;
      const value = seg.value ?? JSON.stringify(seg);
      return `**${value}**`;
    })
    .join('');
}

export function FreeTextExplain({ text }: FreeTextExplainArgs) {
  const md = segmentsToMarkdown(text);

  return (
    <div className="px-2 pb-2 prose prose-sm max-w-none">
      <Markdown>{md}</Markdown>
    </div>
  );
}
