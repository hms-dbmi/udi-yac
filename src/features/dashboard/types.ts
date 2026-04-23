import type { DataPackage, Row } from '@/types/dataPackage';
import type { DataSelections } from './stores/dataFiltersStore';

/**
 * Snapshot of dashboard state passed to a {@link DownloadAction}'s callbacks.
 * The consumer reads this to decide what to export / where to send it.
 */
export interface DownloadActionContext {
  /**
   * Per-source rows reflecting the currently applied filters and brush
   * selections — the same data the built-in "Download Raw Data" action uses.
   */
  rowsBySource: { source: string; rows: Row[] }[];
  /** Active filter selections, keyed by filter id. */
  filters: DataSelections;
  /** The loaded data package, or null if it hasn't resolved yet. */
  dataPackage: DataPackage | null;
}

/**
 * Consumer-configurable item appended to the Download Data dropdown.
 * Custom items render after the built-in actions, separated by a divider.
 */
export interface DownloadAction {
  /** Text shown in the menu item. */
  label: string;
  /** Invoked when the menu item is clicked. May be async. */
  onClick: (ctx: DownloadActionContext) => void | Promise<void>;
  /**
   * When `true` (or a function returning `true`), the item is rendered as
   * disabled. Defaults to `false`.
   */
  disabled?: boolean | ((ctx: DownloadActionContext) => boolean);
}
