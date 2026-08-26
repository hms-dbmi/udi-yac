import { useEffect, useRef, useState } from 'react';
import { UDIToolkitProvider } from 'udi-toolkit/react';
import {
  UDIChatProvider,
  DownloadActionsProvider,
  DownloadButtonLabelProvider,
  EntityIconsProvider,
  MascotProvider,
  SplashMessagesProvider,
  TrackerProvider,
  useConversation,
  useDataPackageStore,
  useDashboardStore,
  useDashboard,
  useDataPackage,
  useDataFiltersStore,
  useDataFilters,
  useMemoryBankStore,
  useGlobal,
  useGlobalStore,
  useTracker,
} from '@/app/UDIChatContext';
import { DataOverviewPanel } from '@/features/data-package';
import { Button } from '@/components/ui/button';
import { extractAllUdiSpecsFromMessage } from '@/features/dashboard/stores/dashboardStore';
import { useLayoutPersistence } from '@/features/dashboard/hooks/useLayoutPersistence';
import type { UDIGrammar } from 'udi-toolkit/react';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { ConversationList } from '@/features/chat/components/ConversationList';
import { useApiKey } from '@/features/chat/hooks/useApiKey';
import { ErrorBoundary } from './ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChatRootProvider } from '@/lib/chatRoot';
import type { QueryConfig } from '@/features/chat/api/completions';
import { validateConfig } from '@/app/validateConfig';
import type { UDIChatConfig } from './UDIChatConfig';

export type { UDIChatConfig };

function UDIChatInner({
  apiBaseUrl,
  remotePackage,
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
  const globalStore = useGlobalStore();
  const debugMode = useGlobal((s) => s.debugMode);
  const overviewOpen = useGlobal((s) => s.overviewOpen);
  const messages = useConversation((s) => s.messages);
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const apiKey = useApiKey({ requireApiKey: requireApiKey === true });
  const trackEvent = useTracker();
  useLayoutPersistence();

  // Load data package on mount
  useEffect(() => {
    if (remotePackage) {
      dataPackageStore.getState().fetchRemotePackage(apiBaseUrl, remotePackage, authToken);
    } else if (dataPackageProp) {
      dataPackageStore
        .getState()
        .setDataPackage(dataPackageProp, dataFieldDomainsProp, fetchOptions);
    } else if (dataPackagePath) {
      dataPackageStore.getState().fetchDataPackage(dataPackagePath, fetchOptions);
    }
  }, [
    dataPackageStore,
    remotePackage,
    apiBaseUrl,
    authToken,
    dataPackagePath,
    dataPackageProp,
    dataFieldDomainsProp,
    fetchOptions,
  ]);

  // Auto-activate visualizations from new assistant messages (batched to avoid O(n^2) cascade)
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
        const key = state.vizKey(i, toolCallIndex);
        if (state.activeVisualizations.has(key)) continue;
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
      state.addActiveVisualizationBatch(batch, dataPackageStore);
      for (const item of batch) {
        // Event name kept as `visualization_pinned` for analytics continuity
        // even though the in-code concept renamed pinning → active.
        trackEvent('visualization_pinned', {
          hasTitle: !!item.title,
          toolCallIndex: item.toolCallIndex,
        });
      }
    }
  }, [messages, dashboardStore, sourceFields, memoryBankStore, dataPackageStore, trackEvent]);

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
  // the set of active visualizations changes. For row-level sources a brush
  // needs no re-run — each viz's own UUID is already in the filter list (from
  // activeVisualizations), so the structure is stable once set up. Cube
  // sources are different: which marginal a visualization must expand to
  // depends on WHICH FIELDS are currently selected, so the brush mirror
  // (internalDataSelections) has to be a dependency too. It updates on brush
  // commit, not per tick, so this stays cheap.
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const internalDataSelections = useDataFilters((s) => s.internalDataSelections);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  useEffect(() => {
    dashboardStore.getState().updateSpecFilters(dataFiltersStore, dataPackageStore);
  }, [
    dataSelections,
    internalDataSelections,
    activeVisualizations,
    dashboardStore,
    dataFiltersStore,
    dataPackageStore,
  ]);

  const queryConfig: QueryConfig = {
    apiBaseUrl,
    authToken,
    model,
    openAiKey: apiKey.openAiKey ?? undefined,
  };

  return (
    // The container query below measures this row, not the viewport: the chat
    // ships as an embeddable library and is routinely mounted into a host
    // column far narrower than the window. It stays off the `.udi-yac` root on
    // purpose — `container-type: inline-size` implies `contain: layout`, which
    // would make the root a containing block for everything useChatRoot()
    // portals into it.
    <div className="@container/shell flex h-full w-full bg-background">
      {/* Sidebar drawer — debug mode only */}
      {debugMode && drawerOpen && (
        <div className="w-56 shrink-0 border-r bg-background overflow-hidden flex flex-col">
          <ConversationList />
        </div>
      )}
      {/*
       * Left region: chat and the data overview. Above 1200px both fit beside
       * the dashboard (400 + 400 + 400), so the region doubles in width and
       * shows them side by side. Below it, the overview takes the chat's slot
       * and the chat is CSS-hidden rather than unmounted, so a streaming
       * response and the message list's scroll position survive the swap.
       * ponytail: 1200 is the one knob — inlined in the variants below because
       * Tailwind scans source text and cannot read a constant.
       */}
      <div
        className={cn(
          'shrink-0 min-w-[300px] border-r flex flex-col overflow-hidden',
          overviewOpen ? 'w-[400px] @min-[1200px]/shell:w-[800px]' : 'w-[400px]',
        )}
      >
        <ViewSwitch
          overviewOpen={overviewOpen}
          onChange={(open) => globalStore.getState().setOverview(open)}
        />
        <div className="flex flex-1 min-h-0">
          <div
            className={cn(
              'flex-1 min-w-0 flex flex-col overflow-hidden',
              overviewOpen && 'hidden @min-[1200px]/shell:flex',
            )}
          >
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
          {overviewOpen && (
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden @min-[1200px]/shell:border-l">
              <DataOverviewPanel />
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <DashboardPanel />
      </div>
    </div>
  );
}

/**
 * Chat ⇄ Data switch, shown only while the shell is too narrow to hold both
 * panes at once.
 *
 * Deliberately not `ui/tabs.tsx`: Base UI's Tabs can only reveal one Panel at
 * a time (inactive ones get `hidden`, which also hides them from assistive
 * tech), and driving its List without Panels leaves `role="tab"` elements with
 * dangling `aria-controls`. Two `aria-pressed` buttons state exactly what this
 * does — choose which pane is visible — and keep a single render path for both
 * layouts, so nothing remounts when the breakpoint is crossed.
 */
function ViewSwitch({
  overviewOpen,
  onChange,
}: {
  overviewOpen: boolean;
  onChange: (open: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Sidebar view"
      className="flex gap-1 border-b px-2 py-1.5 @min-[1200px]/shell:hidden"
    >
      <Button
        variant={overviewOpen ? 'ghost' : 'secondary'}
        size="sm"
        aria-pressed={!overviewOpen}
        onClick={() => onChange(false)}
        className="h-6 flex-1 text-xs"
      >
        Chat
      </Button>
      <Button
        variant={overviewOpen ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={overviewOpen}
        onClick={() => onChange(true)}
        className="h-6 flex-1 text-xs"
      >
        Data
      </Button>
    </div>
  );
}

function UDIChatValidated(props: UDIChatConfig) {
  // Throws on bad config; caught by the surrounding ErrorBoundary so the
  // consumer sees a structured error instead of an opaque crash deep in
  // Arquero or fetch.
  validateConfig(props);
  // Published via ChatRootProvider so popups portal inside our root (where our
  // scoped design tokens live) instead of to document.body, and so the
  // dashboard's drag state can be scoped to us rather than the host page.
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <TooltipProvider>
      <ChatRootProvider value={rootRef}>
        <UDIChatProvider>
          <TrackerProvider onEvent={props.onEvent}>
            <DownloadActionsProvider actions={props.downloadActions}>
              <DownloadButtonLabelProvider label={props.downloadButtonLabel}>
                <EntityIconsProvider icons={props.entityIcons}>
                  {/*
                   * UDIToolkitProvider supersedes the previous local PaletteProvider:
                   * it ships in udi-toolkit/react, sets palette on the React
                   * Context that <UDIVis> already reads, and (optionally) auto-
                   * loads a data package. We only use the palette half here —
                   * the data package is still owned by dataPackageStore so the
                   * existing rich state (loadingPhase, sourceFields, etc.) keeps
                   * working unchanged.
                   */}
                  <UDIToolkitProvider palette={props.palette}>
                    <MascotProvider mascot={props.mascot}>
                      <SplashMessagesProvider messages={props.splashMessages}>
                        {/*
                         * The `udi-yac` class is the scope for every design token
                         * and element reset in index.css. Without it nothing is
                         * styled — and with the tokens on :root instead, mounting
                         * us inside a shadcn host would retheme that host's pages.
                         */}
                        <div
                          ref={rootRef}
                          className={cn('udi-yac h-full w-full', props.className)}
                          style={props.style}
                        >
                          <UDIChatInner {...props} />
                        </div>
                      </SplashMessagesProvider>
                    </MascotProvider>
                  </UDIToolkitProvider>
                </EntityIconsProvider>
              </DownloadButtonLabelProvider>
            </DownloadActionsProvider>
          </TrackerProvider>
        </UDIChatProvider>
      </ChatRootProvider>
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
