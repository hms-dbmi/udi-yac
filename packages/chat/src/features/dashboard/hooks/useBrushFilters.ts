import { useMemo } from 'react';
import type { DataSelection, DataSelections } from '../stores/dataFiltersStore';
import type { ActiveVisualization } from '../stores/dashboardStore';
import { useDataFilters, useDashboard } from '@/app/UDIChatContext';

export interface BrushFilter {
  /** Selection key — the source visualization's uuid. */
  uuid: string;
  /** Dashboard key of the source visualization (for remount/hover coordination). */
  vizKey: string;
  /** Human-readable label for the source visualization. */
  title: string;
  selection: DataSelection;
}

/**
 * Whether a brush selection currently constrains anything. An interval brush
 * always has a range; a point brush with every value unchecked is "present but
 * empty" — its widget should persist for re-selection, but it shouldn't render
 * a (valueless) toolbar chip.
 */
export function brushHasValue(selection: DataSelection): boolean {
  const sel = selection.selection;
  if (sel == null) return false;
  const values = Object.values(sel);
  if (values.length === 0) return false;
  return !values.every((v) => v == null || (Array.isArray(v) && v.length === 0));
}

/**
 * Pure derivation of brush filters from the store's `internalDataSelections`
 * (brush/click selections mirrored out of the shared Pinia DataSourcesStore,
 * keyed by the source viz's uuid) + the active visualizations. Gated to
 * currently-active vizzes so a closed viz's stale selection never shows, and
 * to a present (non-null) selection. A point brush whose values are all
 * unchecked is kept so its chat widget persists; callers that only want
 * value-carrying filters (e.g. the toolbar) filter with `brushHasValue`.
 * Exported for unit testing.
 */
export function selectBrushFilters(
  internalSelections: DataSelections,
  activeVisualizations: Map<string, ActiveVisualization>,
): BrushFilter[] {
  const byUuid = new Map<string, { vizKey: string; title: string }>();
  for (const [vizKey, viz] of activeVisualizations.entries()) {
    byUuid.set(viz.uuid, { vizKey, title: viz.title ?? viz.userPrompt ?? 'Visualization' });
  }

  const result: BrushFilter[] = [];
  for (const [uuid, selection] of Object.entries(internalSelections)) {
    const meta = byUuid.get(uuid);
    if (!meta) continue;
    if (selection.selection == null) continue;
    result.push({ uuid, vizKey: meta.vizKey, title: meta.title, selection });
  }
  return result;
}

/**
 * Brush/click selections created by interacting with a visualization are
 * mirrored into `dataFiltersStore.internalDataSelections` (keyed by the source
 * viz's uuid) by `DashboardCard`'s selection handler. This hook surfaces them
 * as first-class filters for the filter toolbar and the chat adjustment
 * widgets.
 */
export function useBrushFilters(): BrushFilter[] {
  const internalDataSelections = useDataFilters((s) => s.internalDataSelections);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);

  return useMemo(
    () => selectBrushFilters(internalDataSelections, activeVisualizations),
    [internalDataSelections, activeVisualizations],
  );
}
