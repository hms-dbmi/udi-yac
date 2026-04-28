import { useEffect, useState } from 'react';
import {
  UDIChatProvider,
  DownloadActionsProvider,
  EntityIconsProvider,
  MascotProvider,
  SplashMessagesProvider,
  useConversation,
  useDataPackageStore,
  useDashboardStore,
  useDashboard,
  useDataPackage,
  useDataFiltersStore,
  useDataFilters,
  useMemoryBankStore,
  useGlobal,
} from '@/app/UDIChatContext';
import { extractAllUdiSpecsFromMessage } from '@/features/dashboard/stores/dashboardStore';
import type { UDIGrammar } from 'udi-toolkit/react';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { ConversationList } from '@/features/chat/components/ConversationList';
import { useApiKey } from '@/features/chat/hooks/useApiKey';
import { ErrorBoundary } from './ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { QueryConfig } from '@/features/chat/api/completions';
import { validateConfig } from '@/app/validateConfig';
import type { UDIChatConfig } from './UDIChatConfig';

export type { UDIChatConfig };

function UDIChatInner({
  apiBaseUrl,
  dataPackagePath,
  dataPackage: dataPackageProp,
  dataFieldDomains: dataFieldDomainsProp,
  fetchOptions,
  authToken,
  model,
  requireApiKey,
}: UDIChatConfig) {
  const dataPackageStore = useDataPackageStore();
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const memoryBankStore = useMemoryBankStore();
  const debugMode = useGlobal((s) => s.debugMode);
  const messages = useConversation((s) => s.messages);
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const apiKey = useApiKey({ requireApiKey: requireApiKey === true });

  // Load data package on mount
  useEffect(() => {
    if (dataPackageProp) {
      dataPackageStore
        .getState()
        .setDataPackage(dataPackageProp, dataFieldDomainsProp, fetchOptions);
    } else if (dataPackagePath) {
      dataPackageStore.getState().fetchDataPackage(dataPackagePath, fetchOptions);
    }
  }, [dataPackageStore, dataPackagePath, dataPackageProp, dataFieldDomainsProp, fetchOptions]);

  // Auto-pin visualizations from new assistant messages (batched to avoid O(n^2) cascade)
  useEffect(() => {
    const state = dashboardStore.getState();
    const mbState = memoryBankStore.getState();
    const batch: Array<{
      index: number;
      toolCallIndex: number;
      spec: UDIGrammar;
      userPrompt: string;
      sourceFields: Record<string, string[]> | null;
      title?: string;
    }> = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (message.role !== 'assistant') continue;
      const specs = extractAllUdiSpecsFromMessage(message);
      for (const { spec, toolCallIndex, title } of specs) {
        const key = state.pinKey(i, toolCallIndex);
        if (state.pinnedVisualizations.has(key)) continue;
        if (mbState.closedVisualizations.has(key)) continue;
        let userPromptIndex = i - 1;
        while (userPromptIndex >= 0 && messages[userPromptIndex]?.role !== 'user') {
          userPromptIndex--;
        }
        const userPrompt = userPromptIndex >= 0 ? messages[userPromptIndex].content : '';
        batch.push({
          index: i,
          toolCallIndex,
          spec: spec as UDIGrammar,
          userPrompt,
          sourceFields,
          title,
        });
      }
    }
    if (batch.length > 0) {
      state.pinVisualizationBatch(batch);
    }
  }, [messages, dashboardStore, sourceFields, memoryBankStore]);

  // Sync data filters from messages (replaces Vue's watch(messages, ...) in dataFiltersStore)
  useEffect(() => {
    const dpState = dataPackageStore.getState();
    const validate = {
      isValidIntervalFilter: dpState.isValidIntervalFilter,
      isValidPointFilter: dpState.isValidPointFilter,
    };
    dataFiltersStore.getState().syncFiltersFromMessages(messages, validate);
  }, [messages, dataFiltersStore, dataPackageStore]);

  // Update spec filter structure when LLM FilterData selections change or when
  // the set of pinned visualizations changes. Brush selections don't need to
  // trigger this — each viz's own UUID is already in the filter list (from
  // pinnedVisualizations), so the filter structure is stable once set up.
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const pinnedVisualizations = useDashboard((s) => s.pinnedVisualizations);
  useEffect(() => {
    dashboardStore.getState().updateSpecFilters(dataFiltersStore, dataPackageStore);
  }, [dataSelections, pinnedVisualizations, dashboardStore, dataFiltersStore, dataPackageStore]);

  const queryConfig: QueryConfig = {
    apiBaseUrl,
    authToken,
    model,
    openAiKey: apiKey.openAiKey ?? undefined,
  };

  return (
    <div className="flex h-full w-full bg-background">
      {/* Sidebar drawer — debug mode only */}
      {debugMode && drawerOpen && (
        <div className="w-56 shrink-0 border-r bg-background overflow-hidden flex flex-col">
          <ConversationList />
        </div>
      )}
      <div className="w-[400px] min-w-[300px] shrink-0 border-r flex flex-col overflow-hidden">
        <ChatPanel
          config={queryConfig}
          needsApiKey={apiKey.needsApiKey}
          hasApiKey={apiKey.hasApiKey}
          userKeyQuotaExceeded={apiKey.userKeyQuotaExceeded}
          pendingQuotaRetry={apiKey.pendingQuotaRetry}
          onSetApiKey={apiKey.setApiKey}
          onClearApiKey={apiKey.clearApiKey}
          onQuotaRebuff={apiKey.onQuotaRebuff}
          onNormalResponse={apiKey.onNormalResponse}
          onConsumePendingRetry={apiKey.consumePendingRetry}
          showDrawerToggle={debugMode}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((v) => !v)}
        />
      </div>
      <div className="flex-1 min-w-0">
        <DashboardPanel />
      </div>
    </div>
  );
}

function UDIChatValidated(props: UDIChatConfig) {
  // Throws on bad config; caught by the surrounding ErrorBoundary so the
  // consumer sees a structured error instead of an opaque crash deep in
  // Arquero or fetch.
  validateConfig(props);
  return (
    <TooltipProvider>
      <UDIChatProvider>
        <DownloadActionsProvider actions={props.downloadActions}>
          <EntityIconsProvider icons={props.entityIcons}>
            <MascotProvider mascot={props.mascot}>
              <SplashMessagesProvider messages={props.splashMessages}>
                <div className={cn('h-full w-full', props.className)} style={props.style}>
                  <UDIChatInner {...props} />
                </div>
              </SplashMessagesProvider>
            </MascotProvider>
          </EntityIconsProvider>
        </DownloadActionsProvider>
      </UDIChatProvider>
    </TooltipProvider>
  );
}

export function UDIChat(props: UDIChatConfig) {
  return (
    <ErrorBoundary>
      <UDIChatValidated {...props} />
    </ErrorBoundary>
  );
}
