/**
 * Report a selection event to the host's debug log, if it installed one.
 *
 * The chat's dev server sets `globalThis.__UDI_DEBUG_LOG__` (see
 * packages/chat/src/utils/debugLog.ts) when `VITE_UDI_DEBUG_LOG=1`, and writes
 * what arrives to a file. Every other host leaves it unset, so this is a
 * property read and nothing more.
 */
type DebugLogFn = (
  src: string,
  event: string,
  data?: Record<string, unknown>,
) => void;

export function debugLog(
  event: string,
  data: Record<string, unknown> = {},
): void {
  (globalThis as { __UDI_DEBUG_LOG__?: DebugLogFn }).__UDI_DEBUG_LOG__?.(
    'toolkit',
    event,
    data,
  );
}

let lastInstanceId = 0;

/** A fresh id per component instance, to tell instances apart in the log. */
export function nextDebugInstanceId(): number {
  return ++lastInstanceId;
}
