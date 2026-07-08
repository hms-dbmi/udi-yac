/**
 * Public API of the `data-package` feature. Cross-feature and app-layer imports
 * must go through this barrel; intra-feature imports use relative paths.
 */

export {
  createDataPackageStore,
  type DataPackageState,
  type LoadingPhase,
} from './stores/dataPackageStore';

export { joinDataPath } from './utils/joinDataPath';

export {
  evaluateStructuredText,
  hasStructuredReferences,
  type StructuredTextSegment,
} from './utils/structuredTextParser';
