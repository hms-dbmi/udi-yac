import { createStore } from 'zustand/vanilla';
import type { DataSelections } from 'udi-toolkit/react';

export interface SelectionsState {
  selections: DataSelections;
  updateSelections: (newSelections: DataSelections) => void;
  clearSelections: () => void;
}

export function createSelectionsStore() {
  return createStore<SelectionsState>()((set, get) => ({
    selections: {},

    updateSelections: (newSelections) => {
      const current = get().selections;
      // Skip update if every incoming key already has the same serialized value.
      const hasChange = Object.entries(newSelections).some(
        ([key, val]) =>
          !(key in current) ||
          JSON.stringify(current[key]) !== JSON.stringify(val),
      );
      if (!hasChange) return;
      set({ selections: { ...current, ...newSelections } });
    },

    clearSelections: () => set({ selections: {} }),
  }));
}
