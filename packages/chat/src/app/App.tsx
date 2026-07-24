import { UDIChat } from '@/app/UDIChat';

/**
 * Default DataPackage URL — the bundled HuBMAP snapshot synced from the
 * repo-root sample-data/ into public/data on dev/build (a reproducible copy
 * of the live portal export). See sample-data/readme.md.
 */

const HUBMAP_DATAPACKAGE_URL = '/data/hubmap/datapackage.json';
// For direct access to the live portal endpoint (requires CORS bypass in browser):
// const HUBMAP_DATAPACKAGE_URL = 'https://portal.hubmapconsortium.org/metadata/v0/udi/datapackage.json';
// For local development with portal UI running locally in parallel:
// const HUBMAP_DATAPACKAGE_URL = 'http://localhost:5001/metadata/v0/udi/datapackage.json';

/**
 * Standalone dev/demo entry. Configuration is driven by Vite env vars so the
 * same bundle can target different backends and datasets:
 *
 *   VITE_UDI_API_BASE_URL    UDIAgent server (default: http://localhost:8007)
 *   VITE_UDI_DATA_PACKAGE    URL to a datapackage.json. Defaults to the bundled
 *                            `/data/hubmap/datapackage.json` (synced from
 *                            sample-data/). Set to the live portal URL above,
 *                            or any other reachable datapackage, to override.
 *   VITE_UDI_REQUIRE_API_KEY "false" to skip the in-app OpenAI key prompt
 *   VITE_UDI_MODEL           Optional LLM model name override
 *   VITE_UDI_REMOTE_PACKAGE  Name of a server-side data package (configured
 *                            via the agent server's query backends). When set,
 *                            data stays on the server: metadata comes from
 *                            /v1/yac/metadata and queries go to /v1/yac/query.
 *                            Takes precedence over VITE_UDI_DATA_PACKAGE.
 */
function App() {
  const apiBaseUrl = import.meta.env.VITE_UDI_API_BASE_URL ?? 'http://localhost:8007';
  const dataPackagePath = import.meta.env.VITE_UDI_DATA_PACKAGE ?? HUBMAP_DATAPACKAGE_URL;
  const remotePackage = import.meta.env.VITE_UDI_REMOTE_PACKAGE;
  const requireApiKey = import.meta.env.VITE_UDI_REQUIRE_API_KEY !== 'false';
  const model = import.meta.env.VITE_UDI_MODEL;

  return (
    <div className="h-screen">
      <UDIChat
        apiBaseUrl={apiBaseUrl}
        remotePackage={remotePackage}
        dataPackagePath={dataPackagePath}
        requireApiKey={requireApiKey}
        model={model}
      />
    </div>
  );
}

export default App;
