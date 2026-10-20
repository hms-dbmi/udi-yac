import type { TimeFormats } from '../temporal';

/**
 * Async wrapper that lazy-loads ce-entry and delegates to its time-format
 * singleton, which must live in the ce-entry chunk next to UDIVis — same
 * pattern as queryBackend.ts.
 */
export async function setTimeFormats(byEntity: TimeFormats): Promise<void> {
  const { setTimeFormats: impl } = await import('../ce-entry');
  impl(byEntity);
}
