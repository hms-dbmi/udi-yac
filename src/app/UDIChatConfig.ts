import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';
import type { DownloadAction } from '@/features/dashboard';

/**
 * Public configuration surface for the `UDIChat` root component. Extracted
 * from UDIChat.tsx so that `validateConfig` and other app-layer utilities
 * can import the type without reaching into the component module.
 */
export interface UDIChatConfig {
  apiBaseUrl: string;
  /** URL to fetch a datapackage_udi.json from. Ignored when `dataPackage` is provided. */
  dataPackagePath?: string;
  /** Provide a DataPackage object directly instead of fetching from a URL. Takes precedence over `dataPackagePath`. */
  dataPackage?: DataPackage;
  /** Pre-computed field domains. When provided with `dataPackage`, skips CSV loading for domain computation. */
  dataFieldDomains?: DataFieldDomain[];
  /** Custom fetch options (e.g. headers, credentials) forwarded to all data-loading fetch calls. */
  fetchOptions?: RequestInit;
  authToken?: string;
  /** If true, prompt the user to enter an OpenAI API key before chatting. */
  requireApiKey?: boolean;
  model?: string;
  /**
   * Extra items to append to the Download Data dropdown. Each action's
   * `onClick` receives a {@link DownloadActionContext} snapshot of the
   * current filters and per-source rows, so consumers can export, route,
   * or post-process that data in consumer-specific ways. Rendered after
   * the built-in "Download Raw Data" and "Download Manifest" items,
   * separated by a divider.
   */
  downloadActions?: readonly DownloadAction[];
  className?: string;
  style?: React.CSSProperties;
}
