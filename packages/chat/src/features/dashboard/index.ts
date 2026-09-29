/**
 * Public API of the `dashboard` feature. Cross-feature and app-layer imports
 * must go through this barrel; intra-feature imports use relative paths.
 */

export { DashboardPanel } from './components/DashboardPanel';
export { VizTweakComponent } from './components/VizTweakComponent';
export { IntervalFilterComponent } from './components/IntervalFilterComponent';
export { PointFilterComponent } from './components/PointFilterComponent';
export { FilterControls, FilterCollapsible } from './components/FilterControls';

export {
  createDashboardStore,
  extractAllUdiSpecsFromMessage,
  parseTemplateProvenance,
  type DashboardState,
  type ActiveVisualization,
  type TemplateProvenance,
} from './stores/dashboardStore';

export {
  createDataFiltersStore,
  extractFilterSpecFromMessage,
  filterSpecForToolCall,
  messageFilterKeyWithToolCall,
  messageFilterKey,
  HOST_FILTER_PREFIX,
  type DataFiltersState,
  type FilterOrigin,
  type UDIFilter,
  type DataSelection,
  type DataSelections,
} from './stores/dataFiltersStore';

export { createMemoryBankStore, type MemoryBankState } from './stores/memoryBankStore';

export {
  applyFieldLabels,
  buildVizTitle,
  resolveVizTitle,
  vizTitleProvenance,
  type VizTitleLabels,
  type VizTitleSource,
  type VizTitleProvenance,
} from './utils/vizTitle';

export { useVizTitleLabels } from './hooks/useVizTitleLabels';

export {
  useBrushFilters,
  selectBrushFilters,
  brushHasValue,
  type BrushFilter,
} from './hooks/useBrushFilters';

export { useActiveFilters, type ActiveFilter } from './hooks/useFilterChips';

export type {
  DownloadAction,
  DownloadActionContext,
  EntityIconComponent,
  EntityIconMap,
} from './types';
