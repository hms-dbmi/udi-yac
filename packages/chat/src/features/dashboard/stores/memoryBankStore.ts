import { createStore } from 'zustand/vanilla';
import type { ActiveVisualization } from './dashboardStore';

export interface MemoryBankState {
  closedVisualizations: Map<string, ActiveVisualization>;
  addToMemoryBank: (key: string, viz: ActiveVisualization) => void;
  removeFromMemoryBank: (key: string) => void;
  clearMemoryBank: () => void;
}

export function createMemoryBankStore() {
  return createStore<MemoryBankState>()((set) => ({
    closedVisualizations: new Map(),

    addToMemoryBank: (key, viz) => {
      set((state) => {
        const next = new Map(state.closedVisualizations);
        next.set(key, viz);
        return { closedVisualizations: next };
      });
    },

    removeFromMemoryBank: (key) => {
      set((state) => {
        const next = new Map(state.closedVisualizations);
        next.delete(key);
        return { closedVisualizations: next };
      });
    },

    clearMemoryBank: () => set({ closedVisualizations: new Map() }),
  }));
}
