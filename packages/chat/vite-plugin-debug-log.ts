/**
 * Dev-server sink for the chat's debug event log (src/utils/debugLog.ts).
 *
 * With `VITE_UDI_DEBUG_LOG=1`, the page batches filter and selection events —
 * chart reports, store writes, the toolkit's brush and draw-back steps — and
 * POSTs them here, and this appends them as JSON lines to `logs/udi-debug.log`
 * (gitignored). A session reads back as a file rather than a description of
 * what happened on screen.
 *
 * `apply: 'serve'`: a local debugging affordance, never part of a build. The
 * events can hold data values, which is why the file stays on this machine.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

export const DEBUG_LOG_ROUTE = '/__udi-debug-log';
const LOG_FILE = resolve(import.meta.dirname, 'logs/udi-debug.log');

export function debugLogPlugin(): Plugin {
  return {
    name: 'udi-debug-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(DEBUG_LOG_ROUTE, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const events = JSON.parse(body) as unknown[];
            mkdirSync(dirname(LOG_FILE), { recursive: true });
            appendFileSync(LOG_FILE, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}
