/**
 * Public API of the `dashboard` feature. Cross-feature and app-layer imports
 * must go through this barrel; intra-feature imports use relative paths.
 */

export { DashboardPanel } from './components/DashboardPanel';
export { VizTweakComponent } from './components/VizTweakComponent';
export { IntervalFilterComponent } from './components/IntervalFilterComponent';
export { PointFilterComponent } from './components/PointFilterComponent';
export { FilterControls, FilterCollapsible } from './components/FilterControls';
export { IssueReportDialog, IssueReportForm } from './components/IssueReport';
export { currentSessionExport } from './utils/dashboardSerialization';

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
  extractAllFilterSpecsFromMessage,
  extractFilterOperationsFromMessage,
  isFilterDefinition,
  filterSpecForToolCall,
  messageFilterKeyWithToolCall,
  HOST_FILTER_PREFIX,
  columnFilterKey,
  type DataFiltersState,
  type FilterMode,
  type FilterOrigin,
  type UDIFilter,
  type DataSelection,
  type DataSelections,
} from './stores/dataFiltersStore';

export { createMemoryBankStore, type MemoryBankState } from './stores/memoryBankStore';

export {
  buildCubeTransformation,
  buildCubeCountTransformation,
  getRepresentedFields,
  collectFieldReferences,
  marginalDimensions,
  type ActiveFilter as CubeActiveFilter,
  type SkippedFilter,
  type SkipReason,
} from './utils/cubeFilters';

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
export { useToolkitSelections } from './hooks/useToolkitSelections';
export {
  linkedSelections,
  withLinkedSelections,
  isLinkedSelectionKey,
  canonicalColumn,
  canonicalFilter,
} from './utils/linkedSelections';

export {
  useBrushFilters,
  selectBrushFilters,
  brushHasValue,
  type BrushFilter,
} from './hooks/useBrushFilters';

export { useActiveFilters, selectFilters, type ActiveFilter } from './hooks/useFilterChips';
export { agentFilterState, type AgentFilterEntry } from './utils/agentFilterState';

export type {
  DownloadAction,
  DownloadActionContext,
  EntityIconComponent,
  EntityIconMap,
} from './types';
