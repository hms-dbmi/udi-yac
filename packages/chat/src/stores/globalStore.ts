import { createStore } from 'zustand/vanilla';

/**
 * How the chat starts, and whether the user may change it.
 * - `false` (default) — the normal chat + dashboard app.
 * - `true` — starts read-only; the chat is hidden, and an Explore Data button
 *   leaves read-only.
 * - `'locked'` — read-only with no way out, for hosts that embed the dashboard
 *   and do not want their users chatting at all.
 */
export type ReadOnlyOption = boolean | 'locked';

export interface GlobalState {
  debugMode: boolean;
  isProduction: boolean;
  /** Whether the Data Overview view is showing in the left region. */
  overviewOpen: boolean;
  /** Entity whose overview accordion item should be expanded, if any. */
  overviewEntity: string | null;
  /**
   * Read-only mode: the chat pane, the dashboard's top bar and every editing
   * control on the cards (drag, resize, rename, close, field tweak) are hidden.
   * Cross-filtering and the table toggle stay.
   */
  readOnly: boolean;
  /** Whether `readOnly` is fixed for the session. See {@link ReadOnlyOption}. */
  readOnlyLocked: boolean;
  toggleDebugMode: () => void;
  /**
   * Open/close the Data Overview and optionally pick the entity to expand.
   * Omitting `entity` leaves the current one alone (so the header toggle
   * reopens on whatever was last looked at); pass `null` to clear it.
   */
  setOverview: (open: boolean, entity?: string | null) => void;
  /** No-op while `readOnlyLocked` — guarded here rather than at each call site
   *  so no caller can escape the lock. */
  setReadOnly: (value: boolean) => void;
}

export function createGlobalStore(readOnly: ReadOnlyOption = false) {
  return createStore<GlobalState>()((set) => ({
    debugMode: false,
    isProduction: false,
    overviewOpen: false,
    overviewEntity: null,
    readOnly: readOnly !== false,
    readOnlyLocked: readOnly === 'locked',
    toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
    setOverview: (open, entity) =>
      set((state) => ({
        overviewOpen: open,
        overviewEntity: entity === undefined ? state.overviewEntity : entity,
      })),
    setReadOnly: (value) => set((state) => (state.readOnlyLocked ? state : { readOnly: value })),
  }));
}
