import type { ReactNode } from 'react';
import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';
import type { DownloadAction, EntityIconMap } from '@/features/dashboard';

/**
 * Signature for the optional analytics callback — deliberately untyped in
 * the `properties` bag so consumers can forward directly to GA4, Segment,
 * Amplitude, PostHog, or any other tool that accepts
 * `(eventName, properties)`.
 *
 * Event names are stable, snake_case strings. Properties carry metadata
 * only — never raw message content or API key material.
 */
export type TrackerFn = (name: string, properties?: Record<string, unknown>) => void;

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
  /**
   * Map from entity name (as it appears in the data package `resources[].name`)
   * to an icon component. Merged on top of the built-in icons (donors,
   * samples, datasets, …) with consumer entries winning, so you can supply
   * icons for additional entities or override the defaults. Any component
   * that accepts a `className` prop works — lucide-react icons are typical.
   */
  entityIcons?: EntityIconMap;
  /**
   * Controls the mascot rendered on the empty-dashboard splash:
   * - `undefined` (prop omitted): the default YAC mascot image is rendered.
   * - `null`: the mascot is hidden entirely.
   * - any other ReactNode: the provided node is rendered in place of the mascot.
   *
   * The speech-bubble prompt above the mascot is not affected by this prop.
   */
  mascot?: ReactNode | null;
  /**
   * Override the randomised prompts shown in the speech bubble above the
   * mascot on the empty-dashboard splash.
   * - `undefined` (prop omitted): use the built-in defaults.
   * - A non-empty array: pick one of the provided messages at random.
   * - An empty array (`[]`): hide the speech bubble entirely.
   */
  splashMessages?: readonly string[];
  /**
   * Optional analytics callback. When provided, UDIChat emits events for
   * key user actions (messages sent, responses received, rebuffs, API key
   * changes, visualization pin/close, conversation reset, downloads).
   *
   * Callbacks carry metadata only — never raw message content or OpenAI
   * key material — and thrown errors are swallowed so an analytics failure
   * never breaks the chat. See the "Analytics events" section of the
   * README for the full event catalog and the properties each one emits.
   */
  onEvent?: TrackerFn;
  className?: string;
  style?: React.CSSProperties;
}
