import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Preview, TemplateRecord } from '@/types/previews';

type Tab = 'metadata' | 'resolved' | 'template';

/**
 * Expandable panel showing everything behind a template: its metadata as the
 * LLM sees it, the resolved spec being rendered, and the raw unresolved
 * template with its placeholders intact.
 */
export function TemplateDetails({
  template,
  preview,
}: {
  template: TemplateRecord;
  preview: Preview | undefined;
}) {
  const [tab, setTab] = useState<Tab>('metadata');

  const resolvedSpec = preview?.status === 'ok' ? preview.spec : null;
  const bindings = preview?.status === 'ok' ? preview.bindings : null;

  return (
    <div className="border-t border-slate-200 bg-slate-50/60">
      <div className="flex gap-1 px-3 pt-2">
        <TabButton active={tab === 'metadata'} onClick={() => setTab('metadata')}>
          Metadata
        </TabButton>
        <TabButton active={tab === 'resolved'} onClick={() => setTab('resolved')}>
          Resolved spec
        </TabButton>
        <TabButton active={tab === 'template'} onClick={() => setTab('template')}>
          Template
        </TabButton>
      </div>

      <div className="p-3 pt-2">
        {tab === 'metadata' && <Metadata template={template} bindings={bindings} />}

        {tab === 'resolved' &&
          (resolvedSpec ? (
            <CodeBlock text={JSON.stringify(resolvedSpec, null, 2)} />
          ) : (
            <p className="text-xs text-slate-500">
              No resolved spec for this data package — see the preview panel for why.
            </p>
          ))}

        {tab === 'template' && (
          <div className="space-y-2">
            <CodeBlock text={prettyJson(template.specTemplate)} />
            {template.templateGrammarError && (
              <p className="text-xs text-amber-700">
                This template does not conform to the grammar schema:{' '}
                <span className="font-mono">{template.templateGrammarError}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pretty-print a spec template without destroying it if it isn't valid JSON. */
function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function Metadata({
  template,
  bindings,
}: {
  template: TemplateRecord;
  bindings: Record<string, string> | null;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
      <Field label="Description" full>
        {template.description || <Muted>none</Muted>}
      </Field>

      <Field label="Design considerations" full>
        {template.designConsiderations || <Muted>none</Muted>}
      </Field>

      {template.reviewHint && (
        <Field label="Authoring hint" full>
          {template.reviewHint}
        </Field>
      )}

      <Field label="Query patterns" full>
        {template.queryTemplates.length ? (
          <ul className="list-inside list-disc space-y-0.5">
            {template.queryTemplates.map((q) => (
              <li key={q} className="font-mono text-[11px]">
                {q}
              </li>
            ))}
          </ul>
        ) : (
          <Muted>none</Muted>
        )}
      </Field>

      <Field label="Tasks">{template.tasks || <Muted>none</Muted>}</Field>
      <Field label="Task types">
        {template.taskTypes.length ? template.taskTypes.join(', ') : <Muted>none</Muted>}
      </Field>

      <Field label="Chart type">
        {template.chartType} <Muted>({template.chartComplexity})</Muted>
      </Field>
      <Field label="Tags">{template.tags.join(', ')}</Field>

      <Field label="Tool name">
        <span className="font-mono">{template.toolName ?? '—'}</span>
      </Field>
      <Field label="Review key">
        <span className="font-mono">{template.key}</span>{' '}
        <Muted>(spec hash — stable across reordering)</Muted>
      </Field>

      <Field label="Placeholders bound by the model">
        {template.bindingKeys.length ? (
          <span className="font-mono">{template.bindingKeys.join(', ')}</span>
        ) : (
          <Muted>none</Muted>
        )}
      </Field>
      <Field label="Preview bindings">
        {bindings && Object.keys(bindings).length ? (
          <span className="font-mono">
            {Object.entries(bindings)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')}
          </span>
        ) : (
          <Muted>none</Muted>
        )}
      </Field>

      <Field label="Tool description sent to the model" full>
        {template.toolDescription ? (
          <span className="font-mono text-[11px]">{template.toolDescription}</span>
        ) : (
          <Muted>none</Muted>
        )}
      </Field>
    </dl>
  );
}

function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <dt className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-slate-400">{children}</span>;
}

function CodeBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
      <code>{text}</code>
    </pre>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-t-md px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
          : 'text-slate-500 hover:text-slate-800',
      )}
    >
      {children}
    </button>
  );
}
