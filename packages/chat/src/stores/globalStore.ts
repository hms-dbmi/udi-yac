import { createStore } from 'zustand/vanilla';

export interface GlobalState {
  debugMode: boolean;
  isProduction: boolean;
  /** Whether the Data Overview view is showing in the left region. */
  overviewOpen: boolean;
  /** Entity whose overview accordion item should be expanded, if any. */
  overviewEntity: string | null;
  toggleDebugMode: () => void;
  /**
   * Open/close the Data Overview and optionally pick the entity to expand.
   * Omitting `entity` leaves the current one alone (so the header toggle
   * reopens on whatever was last looked at); pass `null` to clear it.
   */
  setOverview: (open: boolean, entity?: string | null) => void;
}

export function createGlobalStore() {
  return createStore<GlobalState>()((set) => ({
    debugMode: false,
    isProduction: false,
    overviewOpen: false,
    overviewEntity: null,
    toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
    setOverview: (open, entity) =>
      set((state) => ({
        overviewOpen: open,
        overviewEntity: entity === undefined ? state.overviewEntity : entity,
      })),
  }));
}
