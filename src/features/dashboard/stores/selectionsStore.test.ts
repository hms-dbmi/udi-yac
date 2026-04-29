import { describe, it, expect } from 'vitest';
import { createSelectionsStore } from './selectionsStore';
import type { DataSelection, PointSelection, RangeSelection } from 'udi-toolkit/react';

type Selection = RangeSelection | PointSelection | null;

function makeSelection(
  field: string,
  value: unknown[],
  type: 'interval' | 'point' = 'interval',
  dataSourceKey = 'donors',
): DataSelection {
  return { dataSourceKey, type, selection: { [field]: value } as unknown as Selection };
}

describe('selectionsStore', () => {
  it('starts with no selections', () => {
    const store = createSelectionsStore();
    expect(store.getState().selections).toEqual({});
  });

  it('updateSelections adds a new selection', () => {
    const store = createSelectionsStore();
    const sel = makeSelection('age', [0, 100]);
    store.getState().updateSelections({ brush1: sel });
    expect(store.getState().selections).toEqual({ brush1: sel });
  });

  it('updateSelections does not re-set state when the value is unchanged', () => {
    const store = createSelectionsStore();
    const sel = makeSelection('age', [0, 100]);
    store.getState().updateSelections({ brush1: sel });
    const first = store.getState().selections;
    // Same shape but a fresh object reference. Equality check is JSON-based.
    store.getState().updateSelections({ brush1: { ...sel, selection: { age: [0, 100] } } });
    expect(store.getState().selections).toBe(first);
  });

  it('updateSelections overwrites an existing key when the value differs', () => {
    const store = createSelectionsStore();
    store.getState().updateSelections({ brush1: makeSelection('age', [0, 50]) });
    store.getState().updateSelections({ brush1: makeSelection('age', [10, 80]) });
    expect(store.getState().selections.brush1.selection).toEqual({ age: [10, 80] });
  });

  it('updateSelections drops keys whose selection is nulled out', () => {
    const store = createSelectionsStore();
    store.getState().updateSelections({ brush1: makeSelection('age', [0, 50]) });
    // Signal a cleared brush by setting selection to null.
    store.getState().updateSelections({
      brush1: {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: null as unknown as Selection,
      },
    });
    expect(store.getState().selections).toEqual({});
  });

  it('updateSelections is a no-op when clearing a key that is not set', () => {
    const store = createSelectionsStore();
    const before = store.getState().selections;
    store.getState().updateSelections({
      brush1: {
        dataSourceKey: 'donors',
        type: 'interval',
        selection: null as unknown as Selection,
      },
    });
    expect(store.getState().selections).toBe(before);
  });

  it('clearSelections empties the store', () => {
    const store = createSelectionsStore();
    store.getState().updateSelections({ brush1: makeSelection('age', [0, 50]) });
    store.getState().clearSelections();
    expect(store.getState().selections).toEqual({});
  });
});
