import { Fragment, useMemo } from 'react';
import type { FreeTextExplainArgs, TextSegment } from '../types';
import { useDataPackage } from '@/app/UDIChatContext';
import { MarkdownText } from '@/components/MarkdownText';
import { FieldListChip } from './FieldListChip';

const FIELD_NAMES_EXPR = /^\{field_names\((.*)\)\}$/;

function unquote(arg: string): string {
  const trimmed = arg.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

type RenderNode =
  | { kind: 'markdown'; key: string; content: string }
  | { kind: 'field_list'; key: string; entity: string; fields: string[] };

// Walk the LLM-emitted TextSegment array and split it into renderable nodes.
// Strings and non-field-list structured elements coalesce into a markdown
// buffer (server-provided `value` is used verbatim for structured elements,
// so display fidelity matches what the orchestrator computed). A structured
// element whose `expression` is a `{field_names(entity)}` reference becomes
// its own field_list node, rendered as a FieldListChip widget.
function buildRenderNodes(
  text: TextSegment[],
  sourceFields: Record<string, string[]> | null,
): RenderNode[] {
  const nodes: RenderNode[] = [];
  let buffer = '';
  let bufferIndex = 0;
  const flush = () => {
    if (!buffer) return;
    nodes.push({ kind: 'markdown', key: `md-${bufferIndex}`, content: buffer });
    buffer = '';
  };
  text.forEach((seg, i) => {
    if (typeof seg === 'string') {
      buffer += seg;
      return;
    }
    const expr = typeof seg.expression === 'string' ? seg.expression : null;
    const fieldNamesMatch = expr?.match(FIELD_NAMES_EXPR);
    if (fieldNamesMatch) {
      flush();
      bufferIndex = i + 1;
      const entity = unquote(fieldNamesMatch[1]);
      const fields = (entity && sourceFields?.[entity]) || [];
      nodes.push({ kind: 'field_list', key: `fl-${i}`, entity, fields });
    } else {
      const value = seg.value ?? JSON.stringify(seg);
      buffer += `**${value}**`;
    }
  });
  flush();
  return nodes;
}

export function FreeTextExplain({ text }: FreeTextExplainArgs) {
  const sourceFields = useDataPackage((s) => s.sourceFields);

  const nodes = useMemo(() => buildRenderNodes(text, sourceFields), [text, sourceFields]);

  // Fast path: no field-list widget — render the whole thing as one markdown
  // block so wrapping markdown constructs (lists, headings) survive across
  // segment boundaries.
  if (nodes.every((n) => n.kind === 'markdown')) {
    const md = nodes.map((n) => n.content).join('');
    return <MarkdownText className="px-2 pb-2">{md}</MarkdownText>;
  }

  return (
    <div className="px-2 pb-2">
      {nodes.map((n) => (
        <Fragment key={n.key}>
          {n.kind === 'markdown' ? (
            <MarkdownText>{n.content}</MarkdownText>
          ) : (
            <FieldListChip entity={n.entity} fields={n.fields} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
