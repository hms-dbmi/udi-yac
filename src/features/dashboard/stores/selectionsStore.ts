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
      const next = { ...current };
      let changed = false;

      for (const [key, val] of Object.entries(newSelections)) {
        if (val.selection == null) {
          // Remove cleared selections instead of storing them.
          if (key in next) {
            delete next[key];
            changed = true;
          }
        } else if (!(key in current) || JSON.stringify(current[key]) !== JSON.stringify(val)) {
          next[key] = val;
          changed = true;
        }
      }

      if (changed) set({ selections: next });
    },

    clearSelections: () => set({ selections: {} }),
  }));
}
