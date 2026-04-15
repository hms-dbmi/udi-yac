import { UDIChat } from '@/app/UDIChat';
import { hubmapRemoteDataPackage } from '@/data/hubmapRemote';

/**
 * Standalone dev/demo entry. Configuration is driven by Vite env vars so the
 * same bundle can target different backends and datasets:
 *
 *   VITE_UDI_API_BASE_URL    UDIAgent server (default: http://localhost:8007)
 *   VITE_UDI_DATA_PACKAGE    Optional path/URL to a datapackage_udi.json. When
 *                            set, takes precedence over the inline default.
 *   VITE_UDI_REQUIRE_API_KEY "false" to skip the in-app OpenAI key prompt
 *   VITE_UDI_MODEL           Optional LLM model name override
 *
 * The default data source is the inline HuBMAP DataPackage in
 * src/data/hubmapRemote.ts, which points `udi:path` at the live HuBMAP Portal
 * metadata API. Override with VITE_UDI_DATA_PACKAGE to point at a local
 * datapackage_udi.json (e.g. `/data/hubmap_2025-05-05/datapackage_udi.json`,
 * served by Vite from public/data/) or any other URL the backend can reach.
 */
function App() {
  const apiBaseUrl = import.meta.env.VITE_UDI_API_BASE_URL ?? 'http://localhost:8007';
  const dataPackagePath = import.meta.env.VITE_UDI_DATA_PACKAGE;
  // Default ON — matches the original App.tsx behavior. Set
  // VITE_UDI_REQUIRE_API_KEY=false to skip the prompt.
  const requireApiKey = import.meta.env.VITE_UDI_REQUIRE_API_KEY !== 'false';
  const model = import.meta.env.VITE_UDI_MODEL;

  // If an env override is supplied, fetch the package from that path; otherwise
  // hand UDIChat the inline HuBMAP-remote default. UDIChat treats `dataPackage`
  // as taking precedence over `dataPackagePath`, so we deliberately pass only
  // one of the two to keep intent clear.
  const dataSourceProps = dataPackagePath
    ? { dataPackagePath }
    : { dataPackage: hubmapRemoteDataPackage };

  return (
    <div className="h-screen">
      <UDIChat
        apiBaseUrl={apiBaseUrl}
        {...dataSourceProps}
        requireApiKey={requireApiKey}
        model={model}
      />
    </div>
  );
}

export default App;
