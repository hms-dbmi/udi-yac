import { useCallback, useState } from 'react';
import { RotateCcw, Save, Lightbulb, FileDown, FlaskConical, Database, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGlobal, useGlobalStore } from '@/app/UDIChatContext';
import { cn } from '@/lib/utils';
import { useExamplePrompts } from '../hooks/useExamplePrompts';
import { useDebugExports } from '../hooks/useDebugExports';
import { MemoryBankButton } from './MemoryBankButton';
import { SessionStatusDialog } from './SessionStatusDialog';
import type { QueryConfig } from '../api/completions';

interface ChatHeaderBarProps {
  config: QueryConfig;
  hasApiKey: boolean;
  onSetApiKey: (key: string) => void;
  onClearApiKey: () => void;
  showDrawerToggle?: boolean;
  onToggleDrawer?: () => void;
  onReset: () => void;
  onExampleClick: (prompt: string) => void;
  isLoading: boolean;
}

/**
 * Top toolbar of the chat panel: drawer toggle, title, example prompts
 * dialog, API key indicator, debug export buttons, and reset button.
 * Owns `debugMode` subscription so that toggling it does not re-render
 * MessageList, ChatInput, or ClosedVisualizationsPanel.
 */
export function ChatHeaderBar({
  config,
  hasApiKey,
  onSetApiKey,
  onClearApiKey,
  showDrawerToggle,
  onToggleDrawer,
  onReset,
  onExampleClick,
  isLoading,
}: ChatHeaderBarProps) {
  const globalStore = useGlobalStore();
  const debugMode = useGlobal((s) => s.debugMode);
  const overviewOpen = useGlobal((s) => s.overviewOpen);
  const { examplePrompts } = useExamplePrompts(config.apiBaseUrl);
  const {
    handleSaveConversation,
    handleExportTestCase,
    handleDownloadDataDomains,
    handleDownloadDataSchema,
  } = useDebugExports(config);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleConfirmReset = useCallback(() => {
    setResetConfirmOpen(false);
    onReset();
  }, [onReset]);

  const handleExampleClick = useCallback(
    (prompt: string) => {
      setExamplesOpen(false);
      onExampleClick(prompt);
    },
    [onExampleClick],
  );

  return (
    <div className="udi:flex udi:items-center udi:justify-between udi:px-3 udi:py-2">
      <div className="udi:flex udi:items-center udi:gap-1">
        {showDrawerToggle && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="udi:h-7 udi:w-7"
                  onClick={onToggleDrawer}
                />
              }
            >
              <Menu className="udi:h-3.5 udi:w-3.5" />
            </TooltipTrigger>
            <TooltipContent>Toggle conversations</TooltipContent>
          </Tooltip>
        )}
        <h2 className="udi:text-sm udi:font-semibold">Chat</h2>
      </div>
      <div className="udi:flex udi:items-center udi:gap-1">
        {/*
         * Only offered once the shell is wide enough to show chat and the data
         * overview together — below that threshold the ViewSwitch above the
         * panes owns this, since opening the overview replaces the chat.
         */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="udi:hidden udi:h-7 udi:w-7 udi:@min-[1200px]/shell:inline-flex"
                aria-pressed={overviewOpen}
                onClick={() => globalStore.getState().setOverview(!overviewOpen)}
              />
            }
          >
            <Database
              className={cn('udi:h-3.5 udi:w-3.5', overviewOpen && 'udi:text-udi-primary')}
            />
          </TooltipTrigger>
          <TooltipContent>{overviewOpen ? 'Hide data overview' : 'Data overview'}</TooltipContent>
        </Tooltip>
        {examplePrompts.length > 0 && (
          <Dialog open={examplesOpen} onOpenChange={setExamplesOpen}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DialogTrigger
                    render={<Button variant="ghost" size="icon" className="udi:h-7 udi:w-7" />}
                  >
                    <Lightbulb className="udi:h-3.5 udi:w-3.5" />
                  </DialogTrigger>
                }
              />
              <TooltipContent>Example prompts</TooltipContent>
            </Tooltip>
            <DialogContent className="udi:max-w-md udi:max-h-[70vh]">
              <DialogHeader>
                <DialogTitle className="udi:text-sm">Example Prompts</DialogTitle>
              </DialogHeader>
              <div className="udi:flex udi:flex-col udi:gap-1 udi:overflow-y-auto udi:max-h-[50vh]">
                {examplePrompts.map((prompt, i) => (
                  <button
                    key={i}
                    className="udi:text-sm udi:text-left udi:text-foreground udi:hover:bg-muted udi:rounded udi:px-3 udi:py-2 udi:w-full"
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
        <MemoryBankButton />
        <SessionStatusDialog
          hasApiKey={hasApiKey}
          onSetApiKey={onSetApiKey}
          onClearApiKey={onClearApiKey}
        />
        {debugMode && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="udi:h-7 udi:w-7"
                    onClick={handleSaveConversation}
                  />
                }
              >
                <Save className="udi:h-3.5 udi:w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Save conversation</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="udi:h-7 udi:w-7"
                    onClick={handleExportTestCase}
                  />
                }
              >
                <FlaskConical className="udi:h-3.5 udi:w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Export test case</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="udi:h-7 udi:w-7"
                    onClick={handleDownloadDataDomains}
                  />
                }
              >
                <Database className="udi:h-3.5 udi:w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Download data domains</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="udi:h-7 udi:w-7"
                    onClick={handleDownloadDataSchema}
                  />
                }
              >
                <FileDown className="udi:h-3.5 udi:w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Download data schema</TooltipContent>
            </Tooltip>
          </>
        )}
        <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
          <Tooltip>
            <TooltipTrigger
              render={
                <DialogTrigger
                  render={<Button variant="ghost" size="icon" className="udi:h-7 udi:w-7" />}
                >
                  <RotateCcw className="udi:h-3.5 udi:w-3.5" />
                </DialogTrigger>
              }
            />
            <TooltipContent>Reset conversation</TooltipContent>
          </Tooltip>
          <DialogContent className="udi:max-w-sm">
            <DialogHeader>
              <DialogTitle className="udi:text-sm">Reset conversation?</DialogTitle>
              <DialogDescription>
                This clears the current chat, all open visualizations, brush selections, the
                closed-viz memory bank, and any active cross-chart filters. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
              <Button variant="destructive" size="sm" onClick={handleConfirmReset}>
                Reset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
