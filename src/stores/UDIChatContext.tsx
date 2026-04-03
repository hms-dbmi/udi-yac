import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { createConversationStore, type ConversationState } from './conversationStore';
import { createDashboardStore, type DashboardState } from './dashboardStore';
import { createDataPackageStore, type DataPackageState } from './dataPackageStore';
import { createSelectionsStore, type SelectionsState } from './selectionsStore';

interface UDIChatStores {
  conversation: StoreApi<ConversationState>;
  dashboard: StoreApi<DashboardState>;
  dataPackage: StoreApi<DataPackageState>;
  selections: StoreApi<SelectionsState>;
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
    };
  }
  return (
    <UDIChatContext.Provider value={storesRef.current}>
      {children}
    </UDIChatContext.Provider>
  );
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
