import { describe, it, expect } from 'vitest';
import { createGlobalStore } from './globalStore';

describe('globalStore', () => {
  it('starts with debug off and production false', () => {
    const store = createGlobalStore();
    expect(store.getState().debugMode).toBe(false);
    expect(store.getState().isProduction).toBe(false);
  });

  it('toggleDebugMode flips the debug flag', () => {
    const store = createGlobalStore();
    store.getState().toggleDebugMode();
    expect(store.getState().debugMode).toBe(true);
    store.getState().toggleDebugMode();
    expect(store.getState().debugMode).toBe(false);
  });

  it('each instance is independent', () => {
    const a = createGlobalStore();
    const b = createGlobalStore();
    a.getState().toggleDebugMode();
    expect(a.getState().debugMode).toBe(true);
    expect(b.getState().debugMode).toBe(false);
  });
});
