/**
 * Public API of the `data-package` feature. Cross-feature and app-layer imports
 * must go through this barrel; intra-feature imports use relative paths.
 */

export {
  createDataPackageStore,
  type DataPackageState,
  type LoadingPhase,
} from './stores/dataPackageStore';

export { DataOverviewPanel } from './components/DataOverviewPanel';

export { joinDataPath } from './utils/joinDataPath';

export {
  evaluateStructuredText,
  hasStructuredReferences,
  type StructuredTextSegment,
} from './utils/structuredTextParser';

export {
  diagnoseFilter,
  normalizePointValues,
  type FilterProbe,
  type FilterDiagnosis,
  type FilterDiagnosisContext,
  type ValueSuggestion,
  type FieldSuggestion,
} from './utils/filterDiagnosis';

// Domain formatting shared with the filter notice's value picker.
export { categoricalValues, formatIntervalDomain } from './utils/entityOverview';
