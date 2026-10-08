import { defineBoot } from '#q-app';
import {
  install as VueMonacoEditorPlugin,
  loader,
} from '@guolao/vue-monaco-editor';
import * as monaco from 'monaco-editor';
// Only the JSON language is used (EditorPage), so only its worker is wired up.
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    return label === 'json' ? new jsonWorker() : new editorWorker();
  },
};

// more info on params: https://v2.quasar.dev/quasar-cli-vite/boot-files
export default defineBoot(({ app }) => {
  monaco.json.jsonDefaults.setDiagnosticsOptions({
    ...monaco.json.jsonDefaults.diagnosticsOptions,
    enableSchemaRequest: true,
    schemas: [
      {
        uri: 'https://raw.githubusercontent.com/hms-dbmi/udi-yac/refs/heads/main/packages/grammar/UDIGrammarSchema.json',
        fileMatch: ['*'],
      },
    ],
  });

  loader.config({ monaco });
  loader.init();

  app.use(VueMonacoEditorPlugin, {});
});
