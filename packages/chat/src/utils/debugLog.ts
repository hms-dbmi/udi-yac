/**
 * A dev-only event log for filter and selection behaviour, written to
 * `packages/chat/logs/udi-debug.log` by the dev server (vite-plugin-debug-log.ts).
 *
 * Off unless the dev server runs with `VITE_UDI_DEBUG_LOG=1`; library and
 * production builds compile it away. The toolkit reports through the same log
 * via `globalThis.__UDI_DEBUG_LOG__`, a hook it calls only when present.
 *
 * Each event: `{t, seq, src, event, ...data}` — `t` is ms since the page
 * loaded, `seq` orders events logged in the same millisecond.
 */
const ENABLED = import.meta.env.DEV && import.meta.env.VITE_UDI_DEBUG_LOG === '1';
const ROUTE = '/__udi-debug-log';

type Event = Record<string, unknown>;
let queue: Event[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

function flush() {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  void fetch(ROUTE, { method: 'POST', body: JSON.stringify(batch), keepalive: true }).catch(
    () => undefined,
  );
}

/** Record one event. Data is copied, so later mutation can't change the log. */
export function debugLog(src: string, event: string, data: Record<string, unknown> = {}): void {
  if (!ENABLED) return;
  let copied: Record<string, unknown>;
  try {
    copied = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  } catch {
    copied = { unserializable: true };
  }
  queue.push({ t: Math.round(performance.now()), seq: seq++, src, event, ...copied });
  timer ??= setTimeout(flush, 250);
}

export const debugLogEnabled = ENABLED;

if (ENABLED) {
  (globalThis as { __UDI_DEBUG_LOG__?: typeof debugLog }).__UDI_DEBUG_LOG__ = debugLog;
  debugLog('chat', 'session-start', { url: location.href });
  addEventListener('pagehide', flush);
}
