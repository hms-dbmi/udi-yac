import { useMemo } from 'react';
import {
  selectionHasValue,
  type DataSelection,
  type DataSelections,
} from '../stores/dataFiltersStore';
import { useDataFilters } from '@/app/UDIChatContext';

/** A column filter a chart created: shown in the chat where it was made. */
export interface BrushFilter {
  /** The column filter's id (`col:{entity}.{field}`). */
  id: string;
  selection: DataSelection;
}

/**
 * Whether a brush selection currently constrains anything. A point brush with
 * every value unchecked, or a cleared interval brush (`{field: []}`), is
 * "present but empty": its widget and chip persist, it just filters nothing.
 */
export const brushHasValue = selectionHasValue;

/**
 * The column filters a chart created, in the order their charts made them:
 * those with a chat anchor (`brushAnchors`). A chart that only replaced a chat
 * filter's values gets none — that filter's widget is already in its message.
 * Kept when the chart closes, and when removed (their widget then offers to
 * restore). Exported for unit testing.
 */
export function selectBrushFilters(
  dataSelections: DataSelections,
  brushAnchors: Record<string, number>,
): BrushFilter[] {
  return Object.keys(brushAnchors)
    .filter((id) => dataSelections[id])
    .sort((a, b) => brushAnchors[a] - brushAnchors[b])
    .map((id) => ({ id, selection: dataSelections[id] }));
}

/** The chat's widgets for chart-made filters (see `selectBrushFilters`). */
export function useBrushFilters(): BrushFilter[] {
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const brushAnchors = useDataFilters((s) => s.brushAnchors);
  return useMemo(
    () => selectBrushFilters(dataSelections, brushAnchors),
    [dataSelections, brushAnchors],
  );
}
