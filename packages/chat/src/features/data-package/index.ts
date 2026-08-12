/**
 * Public API of the `data-package` feature. Cross-feature and app-layer imports
 * must go through this barrel; intra-feature imports use relative paths.
 */

export {
  createDataPackageStore,
  type DataPackageState,
  type LoadingPhase,
  type ContractOp,
} from './stores/dataPackageStore';

export { DataOverviewPanel } from './components/DataOverviewPanel';

export { joinDataPath } from './utils/joinDataPath';

export {
  evaluateStructuredText,
  hasStructuredReferences,
  type StructuredTextSegment,
} from './utils/structuredTextParser';
