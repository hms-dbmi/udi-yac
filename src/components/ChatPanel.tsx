import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RotateCcw, KeyRound, RotateCw, Save, Lightbulb, FileDown, FlaskConical, Database, Menu } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useConversation, useGlobal, useGlobalStore, useDataPackageStore } from '@/stores/UDIChatContext';
import { ChatInput } from './ChatInput';
import { ApiKeyInput } from './ApiKeyInput';
import { MessageList } from './MessageList';
import { useChatApi } from '@/hooks/useChatApi';
import { useConversationStore, useDashboardStore, useSelectionsStore, useMemoryBank, useMemoryBankStore, useDataFiltersStore } from '@/stores/UDIChatContext';
import type { QueryConfig } from '@/api/completions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ChatPanelProps {
  config: QueryConfig;
  needsApiKey: boolean;
  hasApiKey: boolean;
  onSetApiKey: (key: string) => void;
  onClearApiKey: () => void;
  showDrawerToggle?: boolean;
  drawerOpen?: boolean;
  onToggleDrawer?: () => void;
}

export function ChatPanel({ config, needsApiKey, hasApiKey, onSetApiKey, onClearApiKey, showDrawerToggle, onToggleDrawer }: ChatPanelProps) {
  const { sendMessage, isLoading, error } = useChatApi(config);
  const conversationStore = useConversationStore();
  const globalStore = useGlobalStore();
  const dataPackageStore = useDataPackageStore();
  const debugMode = useGlobal((s) => s.debugMode);
  const messages = useConversation((s) => s.messages);
  const hasSystemMessages = messages.some((m) => m.role === 'system');
  const [examplePrompts, setExamplePrompts] = useState<string[]>([]);
  const [showSystemPrompts, setShowSystemPrompts] = useState(false);

  useEffect(() => {
    if (!config.apiBaseUrl) return;
    fetch(`${config.apiBaseUrl}/v1/yac/examples`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          const prompts = data
            .map((p: unknown) => (typeof p === 'string' ? p.trim() : ''))
            .filter((p: string) => p.length > 0);
          setExamplePrompts(prompts);
        }
      })
      .catch(() => {});
  }, [config.apiBaseUrl]);
  const dashboardStore = useDashboardStore();
  const selectionsStore = useSelectionsStore();
  const memoryBankStore = useMemoryBankStore();
  const dataFiltersStore = useDataFiltersStore();
  const closedVisualizations = useMemoryBank((s) => s.closedVisualizations);

  const handleReset = useCallback(() => {
    conversationStore.getState().newConversation();
    dashboardStore.getState().clearAllVisualizations();
    selectionsStore.getState().clearSelections();
    memoryBankStore.getState().clearMemoryBank();
    dataFiltersStore.getState().resetFilters();
  }, [conversationStore, dashboardStore, selectionsStore, memoryBankStore, dataFiltersStore]);

  const handleRestore = useCallback(
    (key: string) => {
      dashboardStore.getState().restoreFromMemoryBank(key, memoryBankStore);
    },
    [dashboardStore, memoryBankStore],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (text.trim() === '!/admin') {
        globalStore.getState().toggleDebugMode();
        return;
      }
      sendMessage(text);
    },
    [sendMessage, globalStore],
  );

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      sendMessage(suggestion);
    },
    [sendMessage],
  );

  const [examplesOpen, setExamplesOpen] = useState(false);

  const handleExampleClick = useCallback(
    (prompt: string) => {
      setExamplesOpen(false);
      sendMessage(prompt);
    },
    [sendMessage],
  );

  const handleSaveConversation = useCallback(() => {
    const json = conversationStore.getState().exportConversation();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `udi-conversation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [conversationStore]);

  const downloadBlob = useCallback((content: string, filename: string, type = 'application/json') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

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
      input: { model: config.model, messages, dataSchema: dpState.dataPackageString, dataDomains: dpState.dataDomainsString },
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1">
          {showDrawerToggle && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleDrawer} title="Toggle conversations">
              <Menu className="h-3.5 w-3.5" />
            </Button>
          )}
          <h2 className="text-sm font-semibold">Chat</h2>
        </div>
        <div className="flex items-center gap-1">
          {examplePrompts.length > 0 && (
            <Dialog open={examplesOpen} onOpenChange={setExamplesOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DialogTrigger
                      render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
                    >
                      <Lightbulb className="h-3.5 w-3.5" />
                    </DialogTrigger>
                  }
                />
                <TooltipContent>Example prompts</TooltipContent>
              </Tooltip>
              <DialogContent className="max-w-md max-h-[70vh]">
                <DialogHeader>
                  <DialogTitle className="text-sm">Example Prompts</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-1 overflow-y-auto max-h-[50vh]">
                  {examplePrompts.map((prompt, i) => (
                    <button
                      key={i}
                      className="text-sm text-left text-foreground hover:bg-muted rounded px-3 py-2 w-full"
                      onClick={() => handleExampleClick(prompt)}
                      disabled={isLoading}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
          {hasApiKey && (
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClearApiKey} />}
              >
                <KeyRound className="h-3.5 w-3.5 text-green-600" />
              </TooltipTrigger>
              <TooltipContent>API key set — click to clear</TooltipContent>
            </Tooltip>
          )}
          {debugMode && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveConversation} />}
                >
                  <Save className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent>Save conversation</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExportTestCase} />}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent>Export test case</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownloadDataDomains} />}
                >
                  <Database className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent>Download data domains</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownloadDataSchema} />}
                >
                  <FileDown className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent>Download data schema</TooltipContent>
              </Tooltip>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Separator />

      {/* Debug toggles */}
      {debugMode && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/50 border-b">
          <div className="flex items-center gap-1.5">
            <Switch
              id="system-prompts"
              checked={showSystemPrompts}
              onCheckedChange={(v) => setShowSystemPrompts(!!v)}
              disabled={!hasSystemMessages}
            />
            <Label htmlFor="system-prompts" className="text-[10px] text-muted-foreground">
              System Prompts{!hasSystemMessages && ' (none)'}
            </Label>
          </div>
        </div>
      )}

      {/* Messages */}
      <MessageList isLoading={isLoading} showSystemPrompts={showSystemPrompts} onSelectSuggestion={handleSuggestion} />

      {/* Error */}
      {error && (
        <div className="px-3 py-1">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Recently closed visualizations */}
      {closedVisualizations.size > 0 && (
        <div className="px-3 py-1.5 border-t">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Recently Closed
          </p>
          <div className="flex flex-col gap-0.5 max-h-20 overflow-y-auto">
            {Array.from(closedVisualizations.entries()).map(([key, viz]) => (
              <button
                key={key}
                className="flex items-center gap-1.5 text-xs text-left hover:bg-muted rounded px-1.5 py-0.5 w-full"
                onClick={() => handleRestore(key)}
              >
                <RotateCw className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{viz.title ?? viz.userPrompt}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area: either API key prompt or chat input */}
      {needsApiKey ? (
        <ApiKeyInput onSubmit={onSetApiKey} />
      ) : (
        <ChatInput onSend={handleSend} disabled={isLoading} />
      )}
    </div>
  );
}
