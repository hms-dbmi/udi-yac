import LZString from 'lz-string';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { UDIVis } from 'udi-toolkit/react';
import grammarSchema from '../../../../packages/grammar/UDIGrammarSchema.json';
import { resolveSpec } from '../grammar/urls';

// Only the JSON language is used, so only its worker is wired up.
self.MonacoEnvironment = {
  getWorker: (_, label) => (label === 'json' ? new jsonWorker() : new editorWorker()),
};
monaco.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  schemas: [{ uri: 'udi-grammar.schema.json', fileMatch: ['*'], schema: grammarSchema }],
});

const DEFAULT_SPEC = `{
  "source": {
    "name": "donors",
    "source": "./data/example_donors.csv"
  },
  "representation": {
    "mark": "point",
    "mapping": [
      { "encoding": "y", "field": "height", "type": "quantitative" },
      { "encoding": "x", "field": "weight", "type": "quantitative" }
    ]
  }
}`;

/** `?spec=` is lz-string compressed JSON, as written by the share button and
 *  the "Open in the editor" links. */
function initialCode() {
  const encoded = new URLSearchParams(location.search).get('spec');
  return (encoded && LZString.decompressFromEncodedURIComponent(encoded)) || DEFAULT_SPEC;
}

export default function GrammarEditor() {
  const host = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const editor = monaco.editor.create(host.current!, {
      value: code,
      language: 'json',
      automaticLayout: true,
      formatOnType: true,
      formatOnPaste: true,
      minimap: { enabled: false },
    });
    const subscription = editor.onDidChangeModelContent(() => {
      setCode(editor.getValue());
      setCopied(false);
    });
    return () => {
      subscription.dispose();
      editor.dispose();
    };
    // The editor owns the text from here on; `code` only follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed = useMemo(() => {
    try {
      return { spec: resolveSpec(JSON.parse(code)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Error parsing specification.' };
    }
  }, [code]);

  async function share() {
    const url = new URL(location.href);
    url.search = `?spec=${LZString.compressToEncodedURIComponent(code)}`;
    history.replaceState(null, '', url);
    await navigator.clipboard.writeText(url.href);
    setCopied(true);
  }

  return (
    <div className="shell">
      <header className="bar">
        <a className="brand" href={`${import.meta.env.BASE_URL.replace(/\/?$/, '/')}grammar/`}>
          UDI grammar
        </a>
        <span>Editor</span>
        <button type="button" onClick={share}>
          {copied ? 'Link copied' : 'Copy share link'}
        </button>
      </header>
      <main className="panes">
        <div ref={host} className="code" />
        <div className="chart">
          {parsed.spec ? <UDIVis spec={parsed.spec} /> : <pre>{parsed.error}</pre>}
        </div>
      </main>
    </div>
  );
}
