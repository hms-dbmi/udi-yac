import { Fragment, useMemo, useState } from 'react';
import type { FreeTextExplainArgs, TextSegment } from '../types';
import type { DataPackageResource } from '@/types/dataPackage';
import { useDataPackage } from '@/app/UDIChatContext';
import { MarkdownText } from '@/components/MarkdownText';
import { FieldListChip } from './FieldListChip';

const FIELD_NAMES_EXPR = /^\{field_names\((.*)\)\}$/;

// CommonMark lets a backslash escape any ASCII punctuation. Escaping all of it
// keeps a value like `donor_id` from opening emphasis or closing the link.
const escapeMarkdown = (s: string) => s.replace(/[!-/:-@[-`{-~]/g, '\\$&');

function dataValueLink(href: string, value: string, label: string | null | undefined): string {
  const title = label ? ` "${escapeMarkdown(label)}"` : '';
  return `[${escapeMarkdown(value)}](${href}${title})`;
}

// What a table's tooltip says: its description and size, from the data package.
function describeEntity(r: DataPackageResource): string {
  const rows = r['udi:hide_count'] ? undefined : r['udi:row_count'];
  const cols = r['udi:column_count'];
  const size = [
    rows != null && `${rows.toLocaleString()} rows`,
    cols != null && `${cols.toLocaleString()} columns`,
  ]
    .filter(Boolean)
    .join(' × ');
  return [r.description?.trim(), size].filter(Boolean).join(' · ');
}

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
// so display fidelity matches what the orchestrator computed). Each one goes
// in as a link to `dataValueHref`, which MarkdownText draws as a data value
// with its `label` ("row count of datasets") on hover. A structured element
// whose `expression` is a `{field_names(entity)}` reference becomes
// its own field_list node, rendered as a FieldListChip widget.
function buildRenderNodes(
  text: TextSegment[],
  sourceFields: Record<string, string[]> | null,
  dataValueHref: string,
  resources: DataPackageResource[] | undefined,
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
      // `{entity_names()}` is one comma-joined value; give each table its own
      // value and tooltip, unless a name isn't a table we know.
      const entities =
        expr === '{entity_names()}'
          ? value.split(', ').map((name) => resources?.find((r) => r.name === name))
          : [];
      if (entities.length && entities.every((r) => r !== undefined)) {
        buffer += entities
          .map((r) => dataValueLink(dataValueHref, r.name, describeEntity(r)))
          .join(', ');
      } else {
        const label = typeof seg.label === 'string' ? seg.label : expr;
        buffer += dataValueLink(dataValueHref, value, label);
      }
    }
  });
  flush();
  return nodes;
}

export function FreeTextExplain({ text }: FreeTextExplainArgs) {
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const resources = useDataPackage((s) => s.dataPackage?.resources);
  // Unguessable per reply, so a link the model writes into its own text can't
  // pass for a computed value.
  const [dataValueHref] = useState(() => `#udi-data-value-${Math.random().toString(36).slice(2)}`);

  const nodes = useMemo(
    () => buildRenderNodes(text, sourceFields, dataValueHref, resources),
    [text, sourceFields, dataValueHref, resources],
  );

  // Fast path: no field-list widget — render the whole thing as one markdown
  // block so wrapping markdown constructs (lists, headings) survive across
  // segment boundaries.
  if (nodes.every((n) => n.kind === 'markdown')) {
    const md = nodes.map((n) => n.content).join('');
    return (
      <MarkdownText className="udi:px-2 udi:pb-2" dataValueHref={dataValueHref}>
        {md}
      </MarkdownText>
    );
  }

  return (
    <div className="udi:px-2 udi:pb-2">
      {nodes.map((n) => (
        <Fragment key={n.key}>
          {n.kind === 'markdown' ? (
            <MarkdownText dataValueHref={dataValueHref}>{n.content}</MarkdownText>
          ) : (
            <FieldListChip entity={n.entity} fields={n.fields} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
