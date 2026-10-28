import type { SourceSpec, LoadDataPackageOptions } from '../loadDataPackage';
import type { CubeMetadata } from '../DataSourcesStore';

/**
 * Thin wrapper that lazy-loads ce-entry (same chunk as UDIVis / queryData)
 * and delegates to the real loadDataPackage implementation. Keeps the
 * React wrapper's static bundle small until the host actually needs it.
 */
export async function loadDataPackage(
  sources: SourceSpec[],
  options?: LoadDataPackageOptions,
): Promise<void> {
  const { loadDataPackage: impl } = await import('../ce-entry');
  return impl(sources, options);
}

/**
 * Cube metadata registered for `sourceName` by `loadDataPackage`, or null
 * for a plain row-level source. Async for the same reason as above — the
 * shared store lives in the lazily-imported ce-entry chunk.
 */
export async function getCubeMetadata(
  sourceName: string,
): Promise<CubeMetadata | null> {
  const { getCubeMetadata: impl } = await import('../ce-entry');
  return impl(sourceName);
}
