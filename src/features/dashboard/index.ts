/**
 * Public API of the `dashboard` feature. Cross-feature and app-layer imports
 * must go through this barrel; intra-feature imports use relative paths.
 */

export { DashboardPanel } from './components/DashboardPanel';
export { VizTweakComponent } from './components/VizTweakComponent';

export {
  createDashboardStore,
  extractAllUdiSpecsFromMessage,
  type DashboardState,
  type ActiveVisualization,
} from './stores/dashboardStore';

export {
  createDataFiltersStore,
  extractFilterSpecFromMessage,
  messageFilterKeyWithToolCall,
  messageFilterKey,
  type DataFiltersState,
  type DataSelection,
  type DataSelections,
} from './stores/dataFiltersStore';

export { createMemoryBankStore, type MemoryBankState } from './stores/memoryBankStore';

export type {
  DownloadAction,
  DownloadActionContext,
  EntityIconComponent,
  EntityIconMap,
} from './types';
