import type { UDIChatConfig } from '@/app/UDIChatConfig';

/**
 * Lightweight runtime validation for the UDIChatConfig shape.
 *
 * Catches the most common consumer mistakes (missing apiBaseUrl, malformed
 * URL, no data source provided, malformed DataPackage) before they fail deep
 * inside Arquero or fetch with opaque stack traces. Errors are thrown so the
 * surrounding ErrorBoundary renders a useful message.
 *
 * This is intentionally NOT a full schema validator — it covers the failure
 * modes we've actually seen in practice. If a field has a bad type that React
 * itself will surface clearly, we don't duplicate that check here.
 */
/**
 * Accepts an absolute URL ("https://agent.example.org") or a same-origin path
 * ("/api/yac"). The path form is what an embed behind the host app's own
 * reverse proxy needs: the host injects auth server-side, so the browser never
 * talks to the agent cross-origin and there is no origin to name here.
 */
function isValidApiBaseUrl(value: string): boolean {
  if (value.startsWith('/')) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function validateConfig(config: UDIChatConfig): void {
  const errors: string[] = [];

  // apiBaseUrl is required and must look like a URL or a same-origin path.
  if (!config.apiBaseUrl || typeof config.apiBaseUrl !== 'string') {
    errors.push('`apiBaseUrl` is required and must be a string (e.g. "http://localhost:8007").');
  } else if (!isValidApiBaseUrl(config.apiBaseUrl)) {
    errors.push(
      `\`apiBaseUrl\` is not a valid URL: ${JSON.stringify(config.apiBaseUrl)}. ` +
        'Use an absolute URL including the protocol (http:// or https://), ' +
        'or a same-origin path starting with "/" (e.g. "/api/yac").',
    );
  }

  // At least one data source mechanism must be provided. `remotePackage` counts:
  // in server-side data mode the schema and domains come from
  // GET /v1/yac/metadata, so there is no local package to point at (and
  // remotePackage takes precedence over both in UDIChat).
  const hasRemote = config.remotePackage != null && config.remotePackage !== '';
  const hasInline = config.dataPackage != null;
  const hasPath = config.dataPackagePath != null && config.dataPackagePath !== '';
  if (!hasRemote && !hasInline && !hasPath) {
    errors.push(
      'No data source provided. Pass `remotePackage` (a server-side data package name), ' +
        '`dataPackage` (an inline DataPackage object), ' +
        'or `dataPackagePath` (a URL/path to a datapackage_udi.json).',
    );
  }

  // If an inline DataPackage was provided, sanity-check its shape.
  if (hasInline) {
    const dp = config.dataPackage!;
    if (typeof dp !== 'object') {
      errors.push('`dataPackage` must be an object.');
    } else {
      if (!Array.isArray(dp.resources) || dp.resources.length === 0) {
        errors.push('`dataPackage.resources` must be a non-empty array.');
      } else {
        dp.resources.forEach((r, i) => {
          if (!r?.name) errors.push(`dataPackage.resources[${i}] is missing a \`name\`.`);
          if (!r?.path) errors.push(`dataPackage.resources[${i}] is missing a \`path\`.`);
        });
      }
      if (!('udi:path' in dp) || typeof (dp as { 'udi:path'?: unknown })['udi:path'] !== 'string') {
        errors.push('`dataPackage["udi:path"]` must be a string base path/URL.');
      }
    }
  }

  // dataFieldDomains, when provided, must be an array.
  if (config.dataFieldDomains != null && !Array.isArray(config.dataFieldDomains)) {
    errors.push('`dataFieldDomains` must be an array of DataFieldDomain objects when provided.');
  }

  if (errors.length > 0) {
    throw new Error(
      `UDIChat config is invalid:\n  - ${errors.join('\n  - ')}\n\n` +
        'See the README for the full UDIChatConfig reference.',
    );
  }
}
