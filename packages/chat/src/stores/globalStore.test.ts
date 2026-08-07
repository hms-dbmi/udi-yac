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

  it('setOverview opens with an entity and closes without clearing it', () => {
    const store = createGlobalStore();
    expect(store.getState().overviewOpen).toBe(false);
    expect(store.getState().overviewEntity).toBeNull();

    store.getState().setOverview(true, 'datasets');
    expect(store.getState().overviewOpen).toBe(true);
    expect(store.getState().overviewEntity).toBe('datasets');

    // Closing keeps the entity so reopening lands where the user left off.
    store.getState().setOverview(false);
    expect(store.getState().overviewOpen).toBe(false);
    expect(store.getState().overviewEntity).toBe('datasets');
  });

  it('setOverview clears the entity only when passed null', () => {
    const store = createGlobalStore();
    store.getState().setOverview(true, 'donors');
    store.getState().setOverview(true, null);
    expect(store.getState().overviewEntity).toBeNull();
    expect(store.getState().overviewOpen).toBe(true);
  });
});
