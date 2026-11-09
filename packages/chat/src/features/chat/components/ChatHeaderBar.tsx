import { useCallback, useState } from 'react';
import {
  Archive,
  Database,
  Ellipsis,
  FileDown,
  FlaskConical,
  KeyRound,
  Lightbulb,
  Menu,
  RotateCcw,
  Save,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGlobal, useGlobalStore, useMemoryBank } from '@/app/UDIChatContext';
import { useExamplePrompts } from '../hooks/useExamplePrompts';
import { useDebugExports } from '../hooks/useDebugExports';
import { MemoryBankDialog } from './MemoryBankDialog';
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
 * Top toolbar of the chat panel: drawer toggle, title, an overflow menu (data
 * overview, example prompts, memory bank, API key & usage, debug exports),
 * and the reset button.
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
  const memoryBankEmpty = useMemoryBank((s) => s.closedVisualizations.size === 0);
  const { examplePrompts } = useExamplePrompts(config.apiBaseUrl);
  const {
    handleSaveConversation,
    handleExportTestCase,
    handleDownloadDataDomains,
    handleDownloadDataSchema,
  } = useDebugExports(config);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [memoryBankOpen, setMemoryBankOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
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
         * Dialogs opened from the menu are controlled from here: a menu item
         * unmounts with its popup, so it cannot host a DialogTrigger.
         */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="udi:h-7 udi:w-7"
                      aria-label="More actions"
                    />
                  }
                >
                  <Ellipsis className="udi:h-3.5 udi:w-3.5" />
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent>More actions</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            {/*
             * Below 1200px the ViewSwitch above the panes also does this. The
             * item can't hide there by container query: the popup portals
             * outside the shell container.
             */}
            <DropdownMenuCheckboxItem
              checked={overviewOpen}
              closeOnClick
              onCheckedChange={(open) => globalStore.getState().setOverview(open)}
            >
              <Database />
              Data overview
            </DropdownMenuCheckboxItem>
            {examplePrompts.length > 0 && (
              <DropdownMenuItem onClick={() => setExamplesOpen(true)}>
                <Lightbulb />
                Example prompts
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={memoryBankEmpty} onClick={() => setMemoryBankOpen(true)}>
              <Archive />
              Memory bank
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSessionOpen(true)}>
              <KeyRound className={hasApiKey ? 'udi:text-green-600' : undefined} />
              API key &amp; usage
            </DropdownMenuItem>
            {debugMode && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSaveConversation}>
                  <Save />
                  Save conversation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportTestCase}>
                  <FlaskConical />
                  Export test case
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadDataDomains}>
                  <Database />
                  Download data domains
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadDataSchema}>
                  <FileDown />
                  Download data schema
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={examplesOpen} onOpenChange={setExamplesOpen}>
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
        <MemoryBankDialog open={memoryBankOpen} onOpenChange={setMemoryBankOpen} />
        <SessionStatusDialog
          open={sessionOpen}
          onOpenChange={setSessionOpen}
          hasApiKey={hasApiKey}
          onSetApiKey={onSetApiKey}
          onClearApiKey={onClearApiKey}
        />
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
