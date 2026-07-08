// Grid configuration: user-tunable via the gear-icon popover, with sane
// defaults applied to fresh dashboards. Stored in the dashboardStore.
export const DEFAULT_GRID_COLS = 3;
export const MIN_GRID_COLS = 1;
export const MAX_GRID_COLS = 8;

// On initial load the column count is derived from the container width:
// ceil(containerWidth / COLUMN_BREAKPOINT_PX), then clamped to [MIN, MAX].
// so value of 700 → 0-700: 1 column, 701-1400: 2 columns, 1401-2100: 3 columns, etc. (up to MAX_GRID_COLS)
export const COLUMN_BREAKPOINT_PX = 700;

export const DEFAULT_GRID_ROW_HEIGHT_PX = 60;
export const MIN_GRID_ROW_HEIGHT_PX = 30;
export const MAX_GRID_ROW_HEIGHT_PX = 120;

// Per-card defaults / floors. With rowHeight=60 px:
//   minH=3 → 180 px (Vega-Lite legibility floor)
//   default=4 → 420 px
export const DEFAULT_CARD_W = 1;
export const DEFAULT_CARD_H = 7;
export const MIN_CARD_H = 3;
export const MIN_CARD_W = 1;

export const GRID_MARGIN: readonly [number, number] = [8, 8];

export const DRAG_HANDLE_CLASS = 'dashboard-card-drag';

// Toggled on document.body while a card is being dragged or resized.
// Paired with a CSS rule that disables text selection across the page —
// see `body.${GRID_INTERACTING_CLASS}` in src/index.css.
export const GRID_INTERACTING_CLASS = 'udi-grid-interacting';

export function clampGridCols(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_GRID_COLS;
  return Math.max(MIN_GRID_COLS, Math.min(MAX_GRID_COLS, Math.floor(n)));
}

export function clampGridRowHeight(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_GRID_ROW_HEIGHT_PX;
  return Math.max(MIN_GRID_ROW_HEIGHT_PX, Math.min(MAX_GRID_ROW_HEIGHT_PX, Math.round(px)));
}

// The width → column-count rule: ceil(containerWidth / COLUMN_BREAKPOINT_PX),
// clamped to [MIN, MAX]. Falls back to the default when the width is unknown.
// Shared by the initial-load sizing in DashboardGrid and the "Reset layout"
// action so both derive the same count.
export function gridColsForWidth(containerWidthPx: number): number {
  if (!Number.isFinite(containerWidthPx) || containerWidthPx <= 0) return DEFAULT_GRID_COLS;
  return clampGridCols(Math.ceil(containerWidthPx / COLUMN_BREAKPOINT_PX));
}
