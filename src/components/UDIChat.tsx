import { useEffect, useState, useCallback } from 'react';
import { UDIChatProvider, useConversation, useDataPackageStore, useDashboardStore, useDataPackage, useDataFiltersStore, useDataFilters, useMemoryBankStore, useGlobal } from '@/stores/UDIChatContext';
import { extractAllUdiSpecsFromMessage } from '@/stores/dashboardStore';
import type { UDIGrammar } from 'udi-toolkit/react';
import { ChatPanel } from './ChatPanel';
import { DashboardPanel } from './DashboardPanel';
import { ConversationList } from './ConversationList';
import { ErrorBoundary } from './ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { QueryConfig } from '@/api/completions';

export interface UDIChatConfig {
  apiBaseUrl: string;
  dataPackagePath: string;
  authToken?: string;
  /** If true, prompt the user to enter an OpenAI API key before chatting. */
  requireApiKey?: boolean;
  model?: string;
  className?: string;
  style?: React.CSSProperties;
}

function UDIChatInner({ apiBaseUrl, dataPackagePath, authToken, model, requireApiKey }: UDIChatConfig) {
  const dataPackageStore = useDataPackageStore();
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const memoryBankStore = useMemoryBankStore();
  const debugMode = useGlobal((s) => s.debugMode);
  const messages = useConversation((s) => s.messages);
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openAiKey, setOpenAiKey] = useState<string | null>(() => {
    try { return localStorage.getItem('udi-chat-api-key'); } catch { return null; }
  });

  // Load data package on mount
  useEffect(() => {
    dataPackageStore.getState().fetchDataPackage(dataPackagePath);
  }, [dataPackageStore, dataPackagePath]);

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
        batch.push({ index: i, toolCallIndex, spec: spec as UDIGrammar, userPrompt, sourceFields, title });
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

  // Update spec filters when data selections change
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const internalDataSelections = useDataFilters((s) => s.internalDataSelections);
  useEffect(() => {
    dashboardStore.getState().updateSpecFilters(dataFiltersStore, dataPackageStore);
  }, [dataSelections, internalDataSelections, dashboardStore, dataFiltersStore, dataPackageStore]);

  const handleSetApiKey = useCallback((key: string) => {
    setOpenAiKey(key);
    try { localStorage.setItem('udi-chat-api-key', key); } catch { /* noop */ }
  }, []);

  const handleClearApiKey = useCallback(() => {
    setOpenAiKey(null);
    try { localStorage.removeItem('udi-chat-api-key'); } catch { /* noop */ }
  }, []);

  const queryConfig: QueryConfig = {
    apiBaseUrl,
    authToken,
    model,
    openAiKey: openAiKey ?? undefined,
  };

  const needsKey = requireApiKey === true && !openAiKey;

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
          needsApiKey={needsKey}
          hasApiKey={!!openAiKey}
          onSetApiKey={handleSetApiKey}
          onClearApiKey={handleClearApiKey}
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

export function UDIChat(props: UDIChatConfig) {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <UDIChatProvider>
          <div className={cn('h-full w-full', props.className)} style={props.style}>
            <UDIChatInner {...props} />
          </div>
        </UDIChatProvider>
      </TooltipProvider>
    </ErrorBoundary>
  );
}
