import Markdown, { type Components } from 'react-markdown';
import { cn } from '@/lib/utils';

// `whitespace-pre-wrap` on `p` preserves hard line breaks inside plain chat
// messages (react-markdown collapses single newlines by default) without
// adding a `remark-breaks` dependency. Markdown constructs (lists, headings,
// code, etc.) render normally — the CSS only affects whitespace within text.
const markdownComponents: Components = {
  p: (props) => <p className="my-2 leading-relaxed whitespace-pre-wrap" {...props} />,
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

interface MarkdownTextProps {
  children: string;
  className?: string;
}

export function MarkdownText({ children, className }: MarkdownTextProps) {
  return (
    <div className={cn('max-w-none text-sm', className)}>
      <Markdown components={markdownComponents}>{children}</Markdown>
    </div>
  );
}
