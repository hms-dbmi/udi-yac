import { useEffect, useState, useCallback } from 'react';
import { UDIChatProvider, useConversation, useDataPackageStore, useDashboardStore, useDataPackage } from '@/stores/UDIChatContext';
import { extractAllUdiSpecsFromMessage } from '@/stores/dashboardStore';
import type { UDIGrammar } from 'udi-toolkit/react';
import { ChatPanel } from './ChatPanel';
import { DashboardPanel } from './DashboardPanel';
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
  const messages = useConversation((s) => s.messages);
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const [openAiKey, setOpenAiKey] = useState<string | null>(null);

  // Load data package on mount
  useEffect(() => {
    dataPackageStore.getState().fetchDataPackage(dataPackagePath);
  }, [dataPackageStore, dataPackagePath]);

  // Auto-pin visualizations from new assistant messages
  useEffect(() => {
    const state = dashboardStore.getState();
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (message.role !== 'assistant') continue;
      const specs = extractAllUdiSpecsFromMessage(message);
      for (const { spec, toolCallIndex, title } of specs) {
        const key = state.pinKey(i, toolCallIndex);
        if (state.pinnedVisualizations.has(key)) continue;
        let userPromptIndex = i - 1;
        while (userPromptIndex >= 0 && messages[userPromptIndex]?.role !== 'user') {
          userPromptIndex--;
        }
        const userPrompt = userPromptIndex >= 0 ? messages[userPromptIndex].content : '';
        state.pinVisualization(i, toolCallIndex, spec as UDIGrammar, userPrompt, sourceFields, title);
      }
    }
  }, [messages, dashboardStore, sourceFields]);

  const handleSetApiKey = useCallback((key: string) => {
    setOpenAiKey(key);
  }, []);

  const handleClearApiKey = useCallback(() => {
    setOpenAiKey(null);
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
      <div className="w-[400px] min-w-[300px] shrink-0 border-r flex flex-col">
        <ChatPanel
          config={queryConfig}
          needsApiKey={needsKey}
          hasApiKey={!!openAiKey}
          onSetApiKey={handleSetApiKey}
          onClearApiKey={handleClearApiKey}
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
