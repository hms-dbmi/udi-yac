import { describe, it, expect } from 'vitest';
import { createMemoryBankStore } from './memoryBankStore';
import type { ActiveVisualization } from './dashboardStore';
import type { UDIGrammar } from 'udi-toolkit/react';

function makeViz(uuid: string, overrides: Partial<ActiveVisualization> = {}): ActiveVisualization {
  const spec = { source: { name: 'donors', source: 'donors.csv' } } as unknown as UDIGrammar;
  return {
    index: 0,
    toolCallIndex: 0,
    spec,
    interactiveSpec: spec,
    userPrompt: 'count donors',
    uuid,
    ...overrides,
  };
}

describe('memoryBankStore', () => {
  it('starts empty', () => {
    const store = createMemoryBankStore();
    expect(store.getState().closedVisualizations.size).toBe(0);
  });

  it('addToMemoryBank inserts a viz keyed by the viz key', () => {
    const store = createMemoryBankStore();
    const viz = makeViz('u1');
    store.getState().addToMemoryBank('0-0', viz);
    expect(store.getState().closedVisualizations.get('0-0')).toBe(viz);
  });

  it('addToMemoryBank overwrites an existing key', () => {
    const store = createMemoryBankStore();
    store.getState().addToMemoryBank('0-0', makeViz('u1'));
    const replacement = makeViz('u2');
    store.getState().addToMemoryBank('0-0', replacement);
    expect(store.getState().closedVisualizations.get('0-0')).toBe(replacement);
  });

  it('addToMemoryBank produces a new Map reference so React subscribers re-render', () => {
    const store = createMemoryBankStore();
    const before = store.getState().closedVisualizations;
    store.getState().addToMemoryBank('0-0', makeViz('u1'));
    expect(store.getState().closedVisualizations).not.toBe(before);
  });

  it('removeFromMemoryBank drops the keyed viz', () => {
    const store = createMemoryBankStore();
    store.getState().addToMemoryBank('0-0', makeViz('u1'));
    store.getState().addToMemoryBank('0-1', makeViz('u2'));
    store.getState().removeFromMemoryBank('0-0');
    expect(store.getState().closedVisualizations.has('0-0')).toBe(false);
    expect(store.getState().closedVisualizations.has('0-1')).toBe(true);
  });

  it('clearMemoryBank wipes all entries', () => {
    const store = createMemoryBankStore();
    store.getState().addToMemoryBank('0-0', makeViz('u1'));
    store.getState().addToMemoryBank('0-1', makeViz('u2'));
    store.getState().clearMemoryBank();
    expect(store.getState().closedVisualizations.size).toBe(0);
  });
});
