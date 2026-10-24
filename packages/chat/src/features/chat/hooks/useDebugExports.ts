import { useCallback } from 'react';
import { useConversationStore, useDataPackageStore } from '@/app/UDIChatContext';
import { saveBlob } from '@/lib/utils';
import type { QueryConfig } from '../api/completions';

/**
 * Bundles the debug-mode export buttons: save conversation, export test case,
 * download data domains, download data schema.
 */
export function useDebugExports(config: QueryConfig): {
  handleSaveConversation: () => void;
  handleExportTestCase: () => void;
  handleDownloadDataDomains: () => void;
  handleDownloadDataSchema: () => void;
} {
  const conversationStore = useConversationStore();
  const dataPackageStore = useDataPackageStore();

  const handleSaveConversation = useCallback(() => {
    const json = conversationStore.getState().exportConversation();
    saveBlob(json, `udi-conversation-${Date.now()}.json`);
  }, [conversationStore]);

  const handleExportTestCase = useCallback(() => {
    const messages = conversationStore.getState().getMessagesFormattedForLLM();
    const dpState = dataPackageStore.getState();
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const tool_calls = lastAssistant?.tool_calls?.map((tc) => tc.function) ?? [];
    const containsFilter = tool_calls.some((tc) => tc.name === 'FilterData');
    const containsVis = tool_calls.some((tc) => tc.name === 'RenderVisualization');
    let orchestrator_choice = 'render-visualization';
    if (containsFilter && containsVis) orchestrator_choice = 'both';
    else if (containsFilter) orchestrator_choice = 'get-subset-of-data';
    const testCase = {
      input: {
        model: config.model,
        messages,
        dataSchema: dpState.dataPackageString,
        dataDomains: dpState.dataDomainsString,
      },
      expected: { tool_calls, orchestrator_choice },
    };
    saveBlob(JSON.stringify(testCase, null, 2), 'test_case.json');
  }, [conversationStore, dataPackageStore, config.model]);

  const handleDownloadDataDomains = useCallback(() => {
    saveBlob(dataPackageStore.getState().dataDomainsString, 'data_domains.json');
  }, [dataPackageStore]);

  const handleDownloadDataSchema = useCallback(() => {
    saveBlob(dataPackageStore.getState().dataPackageString, 'data_schema.json');
  }, [dataPackageStore]);

  return {
    handleSaveConversation,
    handleExportTestCase,
    handleDownloadDataDomains,
    handleDownloadDataSchema,
  };
}
