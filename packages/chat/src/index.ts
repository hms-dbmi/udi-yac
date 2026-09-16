import './index.css';

export { UDIChat } from './app/UDIChat';
export type { UDIChatConfig, TrackerFn } from './app/UDIChatConfig';
// Re-exported so embedders can type the `palette` prop without taking a
// dependency on udi-toolkit — it is bundled into our output, not installed.
export type { UDIPalette } from 'udi-toolkit/react';
export type {
  DataPackage,
  DataPackageResource,
  DataFieldDomain,
  IntervalDomain,
  CategoricalDomain,
  Row,
} from './types/dataPackage';
export type {
  DownloadAction,
  DownloadActionContext,
  EntityIconComponent,
  EntityIconMap,
} from './features/dashboard';
export { joinDataPath } from './features/data-package/utils/joinDataPath';
export type { LoadingPhase } from './features/data-package/stores/dataPackageStore';
