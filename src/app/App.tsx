import { UDIChat } from '@/app/UDIChat';

/**
 * Default DataPackage URL — the live HuBMAP Portal endpoint that dynamically
 * builds a DataPackage from Elasticsearch + UBKG metadata.
 */

// TODO: Swap for production endpoint when ready.
const HUBMAP_DATAPACKAGE_URL = '/data/hubmap_api/datapackage.json';
// For local development with portal UI running in parallel (requires CORS bypass in browser):
// const HUBMAP_DATAPACKAGE_URL = 'http://localhost:5001/metadata/v0/udi/datapackage.json';
// const HUBMAP_DATAPACKAGE_URL =
// 'https://portal.hubmapconsortium.org/metadata/v0/udi/datapackage.json';

/**
 * Standalone dev/demo entry. Configuration is driven by Vite env vars so the
 * same bundle can target different backends and datasets:
 *
 *   VITE_UDI_API_BASE_URL    UDIAgent server (default: http://localhost:8007)
 *   VITE_UDI_DATA_PACKAGE    URL to a datapackage.json. Defaults to the live
 *                            HuBMAP Portal endpoint. Can also be a local path
 *                            (e.g. `/data/hubmap_2025-05-05/datapackage_udi.json`,
 *                            served by Vite from public/data/).
 *   VITE_UDI_REQUIRE_API_KEY "false" to skip the in-app OpenAI key prompt
 *   VITE_UDI_MODEL           Optional LLM model name override
 */
function App() {
  const apiBaseUrl = import.meta.env.VITE_UDI_API_BASE_URL ?? 'http://localhost:8007';
  const dataPackagePath = import.meta.env.VITE_UDI_DATA_PACKAGE ?? HUBMAP_DATAPACKAGE_URL;
  const requireApiKey = import.meta.env.VITE_UDI_REQUIRE_API_KEY !== 'false';
  const model = import.meta.env.VITE_UDI_MODEL;

  return (
    <div className="h-screen">
      <UDIChat
        apiBaseUrl={apiBaseUrl}
        dataPackagePath={dataPackagePath}
        requireApiKey={requireApiKey}
        model={model}
      />
    </div>
  );
}

export default App;
