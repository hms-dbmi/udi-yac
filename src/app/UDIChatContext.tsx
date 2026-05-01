import { createContext, useContext, useRef, useMemo, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import type { DownloadAction, EntityIconMap } from '@/features/dashboard';
import type { TrackerFn } from '@/app/UDIChatConfig';
import { generateEventId } from '@/lib/utils';
import {
  createConversationStore,
  type ConversationState,
} from '@/features/chat/stores/conversationStore';
import {
  createDashboardStore,
  type DashboardState,
} from '@/features/dashboard/stores/dashboardStore';
import {
  createDataPackageStore,
  type DataPackageState,
} from '@/features/data-package/stores/dataPackageStore';
import {
  createSelectionsStore,
  type SelectionsState,
} from '@/features/dashboard/stores/selectionsStore';
import {
  createDataFiltersStore,
  type DataFiltersState,
} from '@/features/dashboard/stores/dataFiltersStore';
import {
  createMemoryBankStore,
  type MemoryBankState,
} from '@/features/dashboard/stores/memoryBankStore';
import { createGlobalStore, type GlobalState } from '@/stores/globalStore';

interface UDIChatStores {
  conversation: StoreApi<ConversationState>;
  dashboard: StoreApi<DashboardState>;
  dataPackage: StoreApi<DataPackageState>;
  selections: StoreApi<SelectionsState>;
  dataFilters: StoreApi<DataFiltersState>;
  memoryBank: StoreApi<MemoryBankState>;
  global: StoreApi<GlobalState>;
}

const UDIChatContext = createContext<UDIChatStores | null>(null);

export function UDIChatProvider({ children }: { children: ReactNode }) {
  const storesRef = useRef<UDIChatStores | null>(null);
  if (storesRef.current == null) {
    storesRef.current = {
      conversation: createConversationStore(),
      dashboard: createDashboardStore(),
      dataPackage: createDataPackageStore(),
      selections: createSelectionsStore(),
      dataFilters: createDataFiltersStore(),
      memoryBank: createMemoryBankStore(),
      global: createGlobalStore(),
    };
  }
  return <UDIChatContext.Provider value={storesRef.current}>{children}</UDIChatContext.Provider>;
}

function useStores() {
  const stores = useContext(UDIChatContext);
  if (!stores) throw new Error('UDIChatProvider is missing');
  return stores;
}

export function useConversation<T>(selector: (state: ConversationState) => T): T {
  return useStore(useStores().conversation, selector);
}

export function useConversationStore(): StoreApi<ConversationState> {
  return useStores().conversation;
}

export function useDashboard<T>(selector: (state: DashboardState) => T): T {
  return useStore(useStores().dashboard, selector);
}

export function useDashboardStore(): StoreApi<DashboardState> {
  return useStores().dashboard;
}

export function useDataPackage<T>(selector: (state: DataPackageState) => T): T {
  return useStore(useStores().dataPackage, selector);
}

export function useDataPackageStore(): StoreApi<DataPackageState> {
  return useStores().dataPackage;
}

export function useSelections<T>(selector: (state: SelectionsState) => T): T {
  return useStore(useStores().selections, selector);
}

export function useSelectionsStore(): StoreApi<SelectionsState> {
  return useStores().selections;
}

export function useDataFilters<T>(selector: (state: DataFiltersState) => T): T {
  return useStore(useStores().dataFilters, selector);
}

export function useDataFiltersStore(): StoreApi<DataFiltersState> {
  return useStores().dataFilters;
}

export function useMemoryBank<T>(selector: (state: MemoryBankState) => T): T {
  return useStore(useStores().memoryBank, selector);
}

export function useMemoryBankStore(): StoreApi<MemoryBankState> {
  return useStores().memoryBank;
}

export function useGlobal<T>(selector: (state: GlobalState) => T): T {
  return useStore(useStores().global, selector);
}

export function useGlobalStore(): StoreApi<GlobalState> {
  return useStores().global;
}

// ---------------------------------------------------------------------------
// Consumer-provided download actions
// ---------------------------------------------------------------------------

const DownloadActionsContext = createContext<readonly DownloadAction[]>([]);

export function DownloadActionsProvider({
  actions,
  children,
}: {
  actions: readonly DownloadAction[] | undefined;
  children: ReactNode;
}) {
  const value = useMemo(() => actions ?? [], [actions]);
  return (
    <DownloadActionsContext.Provider value={value}>{children}</DownloadActionsContext.Provider>
  );
}

export function useDownloadActions(): readonly DownloadAction[] {
  return useContext(DownloadActionsContext);
}

// ---------------------------------------------------------------------------
// Consumer-provided Download button label
// ---------------------------------------------------------------------------

const DEFAULT_DOWNLOAD_BUTTON_LABEL = 'Download Data';
const DownloadButtonLabelContext = createContext<string>(DEFAULT_DOWNLOAD_BUTTON_LABEL);

export function DownloadButtonLabelProvider({
  label,
  children,
}: {
  label: string | undefined;
  children: ReactNode;
}) {
  const value = label && label.length > 0 ? label : DEFAULT_DOWNLOAD_BUTTON_LABEL;
  return (
    <DownloadButtonLabelContext.Provider value={value}>
      {children}
    </DownloadButtonLabelContext.Provider>
  );
}

export function useDownloadButtonLabel(): string {
  return useContext(DownloadButtonLabelContext);
}

// ---------------------------------------------------------------------------
// Consumer-provided entity icon overrides
// ---------------------------------------------------------------------------

const EMPTY_ICON_MAP: EntityIconMap = Object.freeze({});
const EntityIconsContext = createContext<EntityIconMap>(EMPTY_ICON_MAP);

export function EntityIconsProvider({
  icons,
  children,
}: {
  icons: EntityIconMap | undefined;
  children: ReactNode;
}) {
  const value = useMemo(() => icons ?? EMPTY_ICON_MAP, [icons]);
  return <EntityIconsContext.Provider value={value}>{children}</EntityIconsContext.Provider>;
}

export function useEntityIcons(): EntityIconMap {
  return useContext(EntityIconsContext);
}

// ---------------------------------------------------------------------------
// Consumer-provided mascot override
// ---------------------------------------------------------------------------
// Three-state so the default mascot is only rendered when the prop is
// omitted entirely:
//   - `undefined`: fall back to the built-in YAC mascot image
//   - `null`: explicitly hide — render nothing where the mascot would go
//   - any other ReactNode: render the consumer's node in place of the mascot

type MascotValue = ReactNode | null | undefined;

const MascotContext = createContext<MascotValue>(undefined);

export function MascotProvider({ mascot, children }: { mascot: MascotValue; children: ReactNode }) {
  return <MascotContext.Provider value={mascot}>{children}</MascotContext.Provider>;
}

export function useMascot(): MascotValue {
  return useContext(MascotContext);
}

// ---------------------------------------------------------------------------
// Consumer-provided splash messages
// ---------------------------------------------------------------------------
// `undefined` → use built-in defaults.
// Any array (including `[]`) → use exactly those; empty array hides the
// speech bubble entirely. That lets consumers opt out of the prompt without
// adding a separate flag.

const SplashMessagesContext = createContext<readonly string[] | undefined>(undefined);

export function SplashMessagesProvider({
  messages,
  children,
}: {
  messages: readonly string[] | undefined;
  children: ReactNode;
}) {
  return (
    <SplashMessagesContext.Provider value={messages}>{children}</SplashMessagesContext.Provider>
  );
}

export function useSplashMessages(): readonly string[] | undefined {
  return useContext(SplashMessagesContext);
}

// ---------------------------------------------------------------------------
// Consumer-provided analytics tracker
// ---------------------------------------------------------------------------
// The context always holds a callable so that call sites can write
// `tracker('event', {...})` unconditionally. When no `onEvent` is supplied
// on `UDIChatConfig`, the callable is a no-op. Exceptions thrown by the
// consumer's tracker are swallowed — an analytics failure must never
// break the chat.

const NOOP_TRACKER: TrackerFn = () => {};
const TrackerContext = createContext<TrackerFn>(NOOP_TRACKER);

export function TrackerProvider({
  onEvent,
  children,
}: {
  onEvent: TrackerFn | undefined;
  children: ReactNode;
}) {
  // Ref so event call sites keep a stable tracker identity across renders
  // (no invalidation of memoized downstream callbacks) while still picking
  // up the latest `onEvent` prop.
  const latest = useRef<TrackerFn | undefined>(onEvent);
  latest.current = onEvent;
  // One sessionId per `UDIChat` mount — stitches all events from a given
  // chat instance together and distinguishes two tabs apart. Injected into
  // every emitted event's properties bag automatically so call sites
  // never have to thread it through.
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) {
    sessionIdRef.current = generateEventId();
  }
  const tracker = useMemo<TrackerFn>(
    () => (name, properties) => {
      const fn = latest.current;
      if (!fn) return;
      try {
        // Spread the caller's props first, then sessionId last so it
        // always wins if a call site happens to pass its own `sessionId`.
        fn(name, { ...properties, sessionId: sessionIdRef.current });
      } catch {
        /* never propagate tracker errors */
      }
    },
    [],
  );
  return <TrackerContext.Provider value={tracker}>{children}</TrackerContext.Provider>;
}

export function useTracker(): TrackerFn {
  return useContext(TrackerContext);
}
