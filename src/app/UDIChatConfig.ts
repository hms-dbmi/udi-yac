import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';

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
  className?: string;
  style?: React.CSSProperties;
}
