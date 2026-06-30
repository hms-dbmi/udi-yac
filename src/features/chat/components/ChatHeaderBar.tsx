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
import { useGlobal } from '@/app/UDIChatContext';
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
  const debugMode = useGlobal((s) => s.debugMode);
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
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-1">
        {showDrawerToggle && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleDrawer} />
              }
            >
              <Menu className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>Toggle conversations</TooltipContent>
          </Tooltip>
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
                    className="h-7 w-7"
                    onClick={handleSaveConversation}
                  />
                }
              >
                <Save className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Save conversation</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleExportTestCase}
                  />
                }
              >
                <FlaskConical className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Export test case</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleDownloadDataDomains}
                  />
                }
              >
                <Database className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Download data domains</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleDownloadDataSchema}
                  />
                }
              >
                <FileDown className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Download data schema</TooltipContent>
            </Tooltip>
          </>
        )}
        <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
          <Tooltip>
            <TooltipTrigger
              render={
                <DialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </DialogTrigger>
              }
            />
            <TooltipContent>Reset conversation</TooltipContent>
          </Tooltip>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Reset conversation?</DialogTitle>
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
