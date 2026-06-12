import { useEffect, useRef } from 'react';
import { useDashboardStore } from '@/app/UDIChatContext';
import {
  buildPersistedLayoutSnapshot,
  parsePersistedLayoutSnapshot,
} from '../utils/dashboardSerialization';
import type { DashboardLayout, DashboardState } from '../stores/dashboardStore';

// v3 snapshots carry the grid config alongside the item layout. v2
// snapshots (layout only, no gridCols/gridRowHeight) are silently
// discarded by `parsePersistedLayoutSnapshot` — they referenced the old
// rowHeight=30 default and clean rebuild is cheaper than a migration.
const STORAGE_KEY = 'udi-yac:dashboard:v3';
const DEBOUNCE_MS = 300;

function readSnapshot(): ReturnType<typeof parsePersistedLayoutSnapshot> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parsePersistedLayoutSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeSnapshot(
  layout: DashboardLayout,
  vizKeys: string[],
  gridCols: number,
  gridRowHeight: number,
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(buildPersistedLayoutSnapshot(layout, vizKeys, gridCols, gridRowHeight)),
    );
  } catch {
    // localStorage quota or unavailable — silently drop
  }
}

export function useLayoutPersistence(): void {
  const store = useDashboardStore();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const snapshot = readSnapshot();
    if (snapshot && snapshot.ok) {
      const state = store.getState();
      const activeKeys = new Set(state.activeVisualizations.keys());
      const storedKeys = snapshot.value.vizKeys;
      const allMatch =
        storedKeys.length === activeKeys.size && storedKeys.every((k) => activeKeys.has(k));
      if (allMatch) {
        state.setLayoutItems(snapshot.value.layout.items);
      }
      // Grid config (cols + rowHeight) is a per-app preference — restore it
      // regardless of whether the viz keys still match.
      state.setGridCols(snapshot.value.gridCols);
      state.setGridRowHeight(snapshot.value.gridRowHeight);
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastLayout: DashboardLayout | null = null;
    let lastVizKeys: string | null = null;
    let lastGridCols = -1;
    let lastGridRowHeight = -1;

    const flush = (state: DashboardState) => {
      const keys = Array.from(state.activeVisualizations.keys());
      writeSnapshot(state.layout, keys, state.gridCols, state.gridRowHeight);
      lastLayout = state.layout;
      lastVizKeys = keys.join('\n');
      lastGridCols = state.gridCols;
      lastGridRowHeight = state.gridRowHeight;
    };

    const unsub = store.subscribe((state) => {
      const keys = Array.from(state.activeVisualizations.keys()).join('\n');
      if (
        state.layout === lastLayout &&
        keys === lastVizKeys &&
        state.gridCols === lastGridCols &&
        state.gridRowHeight === lastGridRowHeight
      ) {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => flush(store.getState()), DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [store]);
}
