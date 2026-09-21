import Markdown, { type Components } from 'react-markdown';
import { cn } from '@/lib/utils';

// `whitespace-pre-wrap` on `p` preserves hard line breaks inside plain chat
// messages (react-markdown collapses single newlines by default) without
// adding a `remark-breaks` dependency. Markdown constructs (lists, headings,
// code, etc.) render normally — the CSS only affects whitespace within text.
const markdownComponents: Components = {
  p: (props) => <p className="udi:my-2 udi:leading-relaxed udi:whitespace-pre-wrap" {...props} />,
  ul: (props) => <ul className="udi:my-2 udi:list-disc udi:pl-6 udi:space-y-1" {...props} />,
  ol: (props) => <ol className="udi:my-2 udi:list-decimal udi:pl-6 udi:space-y-1" {...props} />,
  li: (props) => <li className="udi:leading-relaxed" {...props} />,
  h1: (props) => <h1 className="udi:mt-3 udi:mb-2 udi:text-lg udi:font-semibold" {...props} />,
  h2: (props) => <h2 className="udi:mt-3 udi:mb-2 udi:text-base udi:font-semibold" {...props} />,
  h3: (props) => <h3 className="udi:mt-2 udi:mb-1 udi:text-sm udi:font-semibold" {...props} />,
  code: (props) => (
    <code
      className="udi:rounded udi:bg-muted udi:px-1 udi:py-0.5 udi:text-[0.85em] udi:font-mono"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="udi:my-2 udi:overflow-x-auto udi:rounded udi:bg-muted udi:p-2 udi:text-[0.85em] udi:font-mono"
      {...props}
    />
  ),
  a: (props) => (
    <a className="udi:text-udi-primary udi:underline" target="_blank" rel="noreferrer" {...props} />
  ),
  blockquote: (props) => (
    <blockquote
      className="udi:my-2 udi:border-l-2 udi:border-udi-gray-300 udi:pl-3 udi:italic"
      {...props}
    />
  ),
};

interface MarkdownTextProps {
  children: string;
  className?: string;
}

export function MarkdownText({ children, className }: MarkdownTextProps) {
  return (
    <div className={cn('udi:max-w-none udi:text-sm', className)}>
      <Markdown components={markdownComponents}>{children}</Markdown>
    </div>
  );
}
