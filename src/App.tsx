import { UDIChat } from '@/components/UDIChat'

function App() {
  return (
    <div className="h-screen">
      <UDIChat
        apiBaseUrl="http://localhost:8007"
        dataPackagePath="./data/hubmap_2025-05-05/datapackage_udi.json"
        requireApiKey
      />
    </div>
  )
}

export default App
