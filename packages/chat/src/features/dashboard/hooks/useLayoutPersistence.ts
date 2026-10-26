import { useEffect, useRef } from 'react';
import { useDashboardStore } from '@/app/UDIChatContext';

// The grid's row height is the one layout setting kept across visits: chart
// positions belong to charts a reload does not bring back, and the column count
// follows the container width (see DashboardGrid). Same key as the v3 snapshot,
// which also carried `gridRowHeight`, so a height saved by an older version
// still applies.
const STORAGE_KEY = 'udi-yac:dashboard:v3';
const DEBOUNCE_MS = 300;

function readRowHeight(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const height: unknown = raw ? JSON.parse(raw)?.gridRowHeight : null;
    return typeof height === 'number' && Number.isFinite(height) ? height : null;
  } catch {
    return null;
  }
}

function writeRowHeight(gridRowHeight: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ gridRowHeight }));
  } catch {
    // localStorage quota or unavailable — silently drop
  }
}

interface LayoutPersistenceOptions {
  /** Off in read-only mode: an embed's layout cannot change, so there is
   *  nothing worth writing to the host's localStorage. Flips back on when the
   *  user leaves read-only. */
  enabled?: boolean;
  /** Off when the dashboard was seeded from `initialSession`: that export
   *  carries its own grid, and a height left over from another session must
   *  not override it. */
  restore?: boolean;
}

export function useLayoutPersistence({
  enabled = true,
  restore = true,
}: LayoutPersistenceOptions = {}): void {
  const store = useDashboardStore();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!restoredRef.current) {
      restoredRef.current = true;
      const height = restore ? readRowHeight() : null;
      if (height !== null) store.getState().setGridRowHeight(height);
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = store.getState().gridRowHeight;
    const unsub = store.subscribe((state) => {
      if (state.gridRowHeight === last) return;
      last = state.gridRowHeight;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => writeRowHeight(last), DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [store, enabled, restore]);
}
