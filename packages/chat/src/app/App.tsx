import { UDIChat } from '@/app/UDIChat';
import { env } from '@/app/env';

/**
 * Standalone dev/demo entry. Every knob is described once in `env.ts`, which
 * also generates `.env.example`, the README table, and `env.d.ts`.
 */
function App() {
  return (
    <div className="h-screen">
      <UDIChat
        apiBaseUrl={env.apiBaseUrl}
        remotePackage={env.remotePackage}
        dataPackagePath={env.dataPackagePath}
        requireApiKey={env.requireApiKey}
        model={env.model}
      />
    </div>
  );
}

export default App;
