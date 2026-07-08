import { createStore } from 'zustand/vanilla';

export interface GlobalState {
  debugMode: boolean;
  isProduction: boolean;
  toggleDebugMode: () => void;
}

export function createGlobalStore() {
  return createStore<GlobalState>()((set) => ({
    debugMode: false,
    isProduction: false,
    toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
  }));
}
