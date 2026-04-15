import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
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
