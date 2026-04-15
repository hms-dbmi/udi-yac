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
export function validateConfig(config: UDIChatConfig): void {
  const errors: string[] = [];

  // apiBaseUrl is required and must look like a URL.
  if (!config.apiBaseUrl || typeof config.apiBaseUrl !== 'string') {
    errors.push('`apiBaseUrl` is required and must be a string (e.g. "http://localhost:8007").');
  } else {
    try {
      new URL(config.apiBaseUrl);
    } catch {
      errors.push(
        `\`apiBaseUrl\` is not a valid URL: ${JSON.stringify(config.apiBaseUrl)}. ` +
          'Include the protocol (http:// or https://).',
      );
    }
  }

  // Exactly one data source mechanism must be provided.
  const hasInline = config.dataPackage != null;
  const hasPath = config.dataPackagePath != null && config.dataPackagePath !== '';
  if (!hasInline && !hasPath) {
    errors.push(
      'No data source provided. Pass either `dataPackage` (an inline DataPackage object) ' +
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
