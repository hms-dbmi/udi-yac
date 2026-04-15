import { useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import type { FreeTextExplainArgs, TextSegment } from '../types';
import { useDataPackageStore } from '@/app/UDIChatContext';
import { evaluateStructuredText, hasStructuredReferences } from '@/features/data-package';

function segmentsToMarkdown(segments: TextSegment[]): string {
  return segments
    .map((seg) => {
      if (typeof seg === 'string') return seg;
      const value = seg.value ?? JSON.stringify(seg);
      return `**${value}**`;
    })
    .join('');
}

// Apply markdown styling via react-markdown's components map.
const markdownComponents: Components = {
  p: (props) => <p className="my-2 leading-relaxed" {...props} />,
  ul: (props) => <ul className="my-2 list-disc pl-6 space-y-1" {...props} />,
  ol: (props) => <ol className="my-2 list-decimal pl-6 space-y-1" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  h1: (props) => <h1 className="mt-3 mb-2 text-lg font-semibold" {...props} />,
  h2: (props) => <h2 className="mt-3 mb-2 text-base font-semibold" {...props} />,
  h3: (props) => <h3 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
  code: (props) => (
    <code className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono" {...props} />
  ),
  pre: (props) => (
    <pre className="my-2 overflow-x-auto rounded bg-muted p-2 text-[0.85em] font-mono" {...props} />
  ),
  a: (props) => (
    <a className="text-udi-primary underline" target="_blank" rel="noreferrer" {...props} />
  ),
  blockquote: (props) => (
    <blockquote className="my-2 border-l-2 border-udi-gray-300 pl-3 italic" {...props} />
  ),
};

export function FreeTextExplain({ text, has_structured_elements }: FreeTextExplainArgs) {
  const dataPackageStore = useDataPackageStore();

  const md = useMemo(() => {
    let raw = segmentsToMarkdown(text);
    if (has_structured_elements && hasStructuredReferences(raw)) {
      const dpState = dataPackageStore.getState();
      const segments = evaluateStructuredText(raw, dpState);
      raw = segments.map((s) => (s.type === 'value' ? `**${s.content}**` : s.content)).join('');
    }
    return raw;
  }, [text, has_structured_elements, dataPackageStore]);

  return (
    <div className="px-2 pb-2 max-w-none text-sm">
      <Markdown components={markdownComponents}>{md}</Markdown>
    </div>
  );
}
