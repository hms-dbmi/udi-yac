import type {
  QueryBackend,
  RemoteBackendConfig,
  RemoteQueryBackend,
} from '../queryBackend';

/**
 * Async wrappers that lazy-load ce-entry and delegate to its query-backend
 * singleton. The singleton MUST live in the ce-entry chunk: each build target
 * (vue / ce / react) embeds its own copy of module state, and UDIVis + the
 * shared Pinia store live in ce-entry — same pattern as queryData.ts.
 */
export async function setQueryBackend(
  backend: QueryBackend | null,
): Promise<void> {
  const { setQueryBackend: impl } = await import('../ce-entry');
  impl(backend);
}

export async function createRemoteBackend(
  config: RemoteBackendConfig,
): Promise<RemoteQueryBackend> {
  const { createRemoteBackend: impl } = await import('../ce-entry');
  return impl(config);
}
