import type { ReactNode } from 'react';

/**
 * Wraps the first case-insensitive occurrence of `query` in `text` with a
 * `<mark>`. Shared by the chat's field chips and the data overview's field list
 * so that filtering looks the same wherever fields are listed.
 */
export function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-300/70 px-0.5 text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
