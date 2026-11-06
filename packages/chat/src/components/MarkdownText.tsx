import { useMemo, type ComponentProps, type ReactNode } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const dataValueClass =
  'udi:cursor-help udi:font-medium udi:text-udi-primary-700 udi:underline udi:decoration-dotted udi:underline-offset-2 udi:dark:text-udi-primary';

function DataValue({ label, children }: { label?: string; children: ReactNode }) {
  if (!label) return <span className={dataValueClass}>{children}</span>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={dataValueClass} tabIndex={0} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

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
  a: Link,
  blockquote: (props) => (
    <blockquote
      className="udi:my-2 udi:border-l-2 udi:border-udi-gray-300 udi:pl-3 udi:italic"
      {...props}
    />
  ),
};

function Link(props: ComponentProps<'a'> & ExtraProps) {
  return (
    <a className="udi:text-udi-primary udi:underline" target="_blank" rel="noreferrer" {...props} />
  );
}

interface MarkdownTextProps {
  children: string;
  className?: string;
  /**
   * Links to exactly this href render as values computed from the data, with
   * the link title as their tooltip, rather than as links. Only FreeTextExplain
   * sets it, to an href it makes up per reply, so a link someone types (the user,
   * or the model in its own text) can't pass for a computed value.
   */
  dataValueHref?: string;
}

export function MarkdownText({ children, className, dataValueHref }: MarkdownTextProps) {
  const components = useMemo<Components>(
    () =>
      dataValueHref
        ? {
            ...markdownComponents,
            a: (props) =>
              props.href === dataValueHref ? (
                <DataValue label={props.title}>{props.children}</DataValue>
              ) : (
                <Link {...props} />
              ),
          }
        : markdownComponents,
    [dataValueHref],
  );
  return (
    <div className={cn('udi:max-w-none udi:text-sm', className)}>
      {/* No images: the browser would fetch one unasked, so a reply steered by
          text in the data, or an imported session, could send data to any host
          in its URL. */}
      <Markdown components={components} disallowedElements={['img']} unwrapDisallowed>
        {children}
      </Markdown>
    </div>
  );
}
