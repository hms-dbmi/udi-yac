import { useCallback } from 'react';
import { useConversationStore, useDataPackageStore } from '@/app/UDIChatContext';
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

  const downloadBlob = useCallback(
    (content: string, filename: string, type = 'application/json') => {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [],
  );

  const handleSaveConversation = useCallback(() => {
    const json = conversationStore.getState().exportConversation();
    downloadBlob(json, `udi-conversation-${Date.now()}.json`);
  }, [conversationStore, downloadBlob]);

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
    downloadBlob(JSON.stringify(testCase, null, 2), 'test_case.json');
  }, [conversationStore, dataPackageStore, config.model, downloadBlob]);

  const handleDownloadDataDomains = useCallback(() => {
    downloadBlob(dataPackageStore.getState().dataDomainsString, 'data_domains.json');
  }, [dataPackageStore, downloadBlob]);

  const handleDownloadDataSchema = useCallback(() => {
    downloadBlob(dataPackageStore.getState().dataPackageString, 'data_schema.json');
  }, [dataPackageStore, downloadBlob]);

  return {
    handleSaveConversation,
    handleExportTestCase,
    handleDownloadDataDomains,
    handleDownloadDataSchema,
  };
}
