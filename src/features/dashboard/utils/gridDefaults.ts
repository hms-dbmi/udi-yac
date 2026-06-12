// Grid configuration: user-tunable via the gear-icon popover, with sane
// defaults applied to fresh dashboards. Stored in the dashboardStore.
export const DEFAULT_GRID_COLS = 3;
export const MIN_GRID_COLS = 1;
export const MAX_GRID_COLS = 8;

export const DEFAULT_GRID_ROW_HEIGHT_PX = 60;
export const MIN_GRID_ROW_HEIGHT_PX = 30;
export const MAX_GRID_ROW_HEIGHT_PX = 120;

// Per-card defaults / floors. With rowHeight=60 px:
//   minH=3 → 180 px (Vega-Lite legibility floor)
//   default=4 → 240 px
export const DEFAULT_CARD_W = 1;
export const DEFAULT_CARD_H = 4;
export const MIN_CARD_H = 3;
export const MIN_CARD_W = 1;

export const GRID_MARGIN: readonly [number, number] = [8, 8];

export const DRAG_HANDLE_CLASS = 'dashboard-card-drag';

export function clampGridCols(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_GRID_COLS;
  return Math.max(MIN_GRID_COLS, Math.min(MAX_GRID_COLS, Math.floor(n)));
}

export function clampGridRowHeight(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_GRID_ROW_HEIGHT_PX;
  return Math.max(MIN_GRID_ROW_HEIGHT_PX, Math.min(MAX_GRID_ROW_HEIGHT_PX, Math.round(px)));
}
