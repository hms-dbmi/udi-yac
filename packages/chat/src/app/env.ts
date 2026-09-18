/**
 * Standalone-app configuration — the single source of truth for every Vite env
 * var the chat reads.
 *
 * Each variable is described once in `envVars.ts`, which generates
 * `.env.example`, the README table, and `env.d.ts`. Add a var here and there.
 *
 * None of this applies to library consumers: they pass `UDIChatConfig` props
 * directly. This is only how the bundled standalone app is configured.
 */

import { HUBMAP_DATAPACKAGE_URL } from '@/app/envVars';

/** A blank value means "unset". CI interpolates `""` for an unset repo
 *  variable (`${{ vars.FOO }}`), which would otherwise defeat `??` and leave
 *  e.g. `dataPackagePath === ''` — falling through every data-source branch in
 *  UDIChat and rendering a blank app with no error. */
export function str(raw: string | undefined, fallback: string): string;
export function str(raw: string | undefined, fallback?: undefined): string | undefined;
export function str(raw: string | undefined, fallback?: string): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : fallback;
}

/** Accepts the spellings people actually write, rather than treating
 *  everything except the exact lowercase `"false"` as true. */
export function bool(raw: string | undefined, fallback: boolean): boolean {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  console.warn(
    `[udi-yac] unrecognized boolean env value ${JSON.stringify(raw)}; ` +
      `using ${fallback}. Use true/false.`,
  );
  return fallback;
}

/** Parsed standalone-app config. Read by `App.tsx`; nothing else should touch
 *  `import.meta.env` directly. */
export const env = {
  apiBaseUrl: str(import.meta.env.VITE_UDI_API_BASE_URL, 'http://localhost:8007'),
  dataPackagePath: str(import.meta.env.VITE_UDI_DATA_PACKAGE, HUBMAP_DATAPACKAGE_URL),
  remotePackage: str(import.meta.env.VITE_UDI_REMOTE_PACKAGE),
  requireApiKey: bool(import.meta.env.VITE_UDI_REQUIRE_API_KEY, true),
  model: str(import.meta.env.VITE_UDI_MODEL),
};
