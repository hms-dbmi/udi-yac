import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { UDIToolkitProvider } from 'udi-toolkit/react';
import { useThemePalette } from './useThemePalette';
import {
  UDIChatProvider,
  DownloadActionsProvider,
  DownloadButtonLabelProvider,
  EntityIconsProvider,
  MascotProvider,
  ApiConfigProvider,
  SplashMessagesProvider,
  TrackerProvider,
  useConversation,
  useConversationStore,
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
import { extractAllUdiSpecsFromMessage, type TemplateProvenance } from '@/features/dashboard';
import { useLayoutPersistence } from '@/features/dashboard/hooks/useLayoutPersistence';
import { parseSessionExport } from '@/features/dashboard/utils/dashboardSerialization';
import { applySessionExport } from '@/features/dashboard/utils/applySessionExport';
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
  initialSession,
}: UDIChatConfig) {
  const conversationStore = useConversationStore();
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
  const readOnly = useGlobal((s) => s.readOnly);
  const readOnlyLocked = useGlobal((s) => s.readOnlyLocked);
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  useLayoutPersistence({ enabled: !readOnly, restore: initialSession == null });

  // Keep the store's token current. A host that refreshes the JWT must not
  // trigger a package reload: `authToken` is deliberately absent from the
  // loader effect's deps below, and the remote query backend re-reads the token
  // from the store on every request instead of capturing it.
  useEffect(() => {
    dataPackageStore.getState().setAuthToken(authToken);
  }, [dataPackageStore, authToken]);

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
    // authToken is intentionally excluded from the deps below: reloading the
    // whole package on every token refresh is exactly the bug this avoids. The
    // effect above keeps the store's copy in sync, and the remote backend reads
    // it from there per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataPackageStore,
    remotePackage,
    apiBaseUrl,
    dataPackagePath,
    dataPackageProp,
    dataFieldDomainsProp,
    fetchOptions,
  ]);

  // Seed from `initialSession`, once, after the data package is ready: the
  // cards need its field lists to become interactive. `validateConfig` already
  // rejected a malformed payload, so a parse failure here cannot happen — bail
  // rather than throw from inside an effect if it somehow does.
  const parsedInitialSession = useMemo(
    () => (initialSession == null ? null : parseSessionExport(initialSession)),
    [initialSession],
  );
  // A layout effect, so the cards land before the frame where the package turns
  // ready is painted — otherwise that frame shows the empty dashboard's splash.
  const seededRef = useRef(false);
  useLayoutEffect(() => {
    if (seededRef.current) return;
    if (!parsedInitialSession?.ok) return;
    if (loadingPhase !== 'ready') return;
    seededRef.current = true;
    applySessionExport(
      parsedInitialSession.value,
      { conversation: conversationStore, dashboard: dashboardStore },
      dataPackageStore.getState().sourceFields,
    );
  }, [parsedInitialSession, loadingPhase, conversationStore, dashboardStore, dataPackageStore]);
  // Until then the dashboard is not empty, only not filled yet.
  const seeding =
    parsedInitialSession?.ok === true && loadingPhase !== 'ready' && loadingPhase !== 'error';

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
      template?: TemplateProvenance;
      titleTemplate?: string;
      summaryTemplate?: string;
    }> = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (message.role !== 'assistant') continue;
      const specs = extractAllUdiSpecsFromMessage(message);
      for (const {
        spec,
        toolCallIndex,
        title,
        titleTemplate,
        summaryTemplate,
        template,
      } of specs) {
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
          titleTemplate,
          summaryTemplate,
          template,
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
  // the set of active visualizations changes. Brush selections don't need to
  // trigger this — each viz's own UUID is already in the filter list (from
  // activeVisualizations), so the filter structure is stable once set up.
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const activeVisualizations = useDashboard((s) => s.activeVisualizations);
  useEffect(() => {
    dashboardStore.getState().updateSpecFilters(dataFiltersStore, dataPackageStore);
  }, [dataSelections, activeVisualizations, dashboardStore, dataFiltersStore, dataPackageStore]);

  const exitReadOnly = () => {
    // The seeded transcript would open the chat on a wall of prompts nobody
    // here typed. Hidden, not dropped — see `hiddenCount`.
    conversationStore.getState().hideMessages();
    globalStore.getState().setReadOnly(false);
    trackEvent('read_only_exited', {});
  };

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
    <div className="udi:@container/shell udi:flex udi:h-full udi:w-full udi:bg-background">
      {/*
       * Read-only drops the whole left region, so the dashboard gets the full
       * width; the floating Explore Data button is the way back. One branch,
       * rather than a per-control sweep, because the chat pane is where every
       * writing affordance lives — the input and its `//admin` backdoor, reset,
       * example prompts, the memory bank, the API key, closed-viz restore, and
       * the data overview's "Open on dashboard" button. Nothing here is
       * unmounted for good: leaving read-only re-renders the region with its
       * state intact.
       */}
      {!readOnly && (
        <>
          {/* Sidebar drawer — debug mode only */}
          {debugMode && drawerOpen && (
            <div className="udi:w-56 udi:shrink-0 udi:border-r udi:bg-background udi:overflow-hidden udi:flex udi:flex-col">
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
              'udi:shrink-0 udi:min-w-[300px] udi:border-r udi:flex udi:flex-col udi:overflow-hidden',
              overviewOpen ? 'udi:w-[400px] udi:@min-[1200px]/shell:w-[800px]' : 'udi:w-[400px]',
            )}
          >
            <ViewSwitch
              overviewOpen={overviewOpen}
              onChange={(open) => globalStore.getState().setOverview(open)}
            />
            <div className="udi:flex udi:flex-1 udi:min-h-0">
              <div
                // A popover opened from a chart *in the chat* aligns its left edge
                // to this column rather than to its trigger, which sits indented
                // inside a bubble — 320px starting there would spill over the
                // dashboard. Found with `closest()` from the trigger, so no ref or
                // context is needed.
                data-udi-chat-column=""
                className={cn(
                  'udi:flex-1 udi:min-w-0 udi:flex udi:flex-col udi:overflow-hidden',
                  overviewOpen && 'udi:hidden udi:@min-[1200px]/shell:flex',
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
                <div className="udi:flex-1 udi:min-w-0 udi:flex udi:flex-col udi:overflow-hidden udi:@min-[1200px]/shell:border-l">
                  <DataOverviewPanel />
                </div>
              )}
            </div>
          </div>
        </>
      )}
      <div className="udi:relative udi:flex-1 udi:min-w-0 udi:overflow-hidden">
        <DashboardPanel seeding={seeding} />
        {readOnly && !readOnlyLocked && <ExploreDataButton onClick={exitReadOnly} />}
      </div>
    </div>
  );
}

/**
 * The way out of read-only, floating over the dashboard's bottom-right corner
 * just left of its scroll buttons: a reader looking at the charts is looking
 * there. `absolute`, not `fixed` — embedded in a host's column, `fixed` would
 * pin it to the host page's viewport.
 */
function ExploreDataButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      className="udi:absolute udi:right-14 udi:bottom-3 udi:z-20 udi:h-11 udi:gap-2 udi:rounded-lg udi:border udi:border-udi-gray-300 udi:bg-udi-primary-700 udi:px-5 udi:text-base udi:text-white udi:shadow-lg udi:hover:bg-udi-primary-700/90"
    >
      <Sparkles className="udi:size-5" />
      Explore Data
    </Button>
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
      className="udi:flex udi:gap-1 udi:border-b udi:px-2 udi:py-1.5 udi:@min-[1200px]/shell:hidden"
    >
      <Button
        variant={overviewOpen ? 'ghost' : 'secondary'}
        size="sm"
        aria-pressed={!overviewOpen}
        onClick={() => onChange(false)}
        className="udi:h-6 udi:flex-1 udi:text-xs"
      >
        Chat
      </Button>
      <Button
        variant={overviewOpen ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={overviewOpen}
        onClick={() => onChange(true)}
        className="udi:h-6 udi:flex-1 udi:text-xs"
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
  // Charts and tables render inside `.udi-yac` but are drawn by Vega and
  // ag-grid, neither of which can see our CSS — so the theme has to be handed
  // to them as colors. `props.palette` still wins per channel.
  const themePalette = useThemePalette(rootRef, props.palette);
  return (
    <TooltipProvider>
      <ChatRootProvider value={rootRef}>
        <UDIChatProvider readOnly={props.readOnly}>
          <ApiConfigProvider apiBaseUrl={props.apiBaseUrl} authToken={props.authToken}>
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
                    <UDIToolkitProvider palette={themePalette}>
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
                            className={cn('udi-yac udi:h-full udi:w-full', props.className)}
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
          </ApiConfigProvider>
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

/**
 * `UDIChat` started in read-only mode — the dashboard embed. Pass
 * `initialSession` to give it something to show, and `readOnly="locked"` via
 * `UDIChat` itself if the user must not be able to open the chat at all.
 */
export function UDIDashboard(props: Omit<UDIChatConfig, 'readOnly'>) {
  return <UDIChat {...props} readOnly />;
}
