import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useConversation } from '@/app/UDIChatContext';
import { ApiKeyInput } from './ApiKeyInput';

interface SessionStatusDialogProps {
  hasApiKey: boolean;
  onSetApiKey: (key: string) => void;
  onClearApiKey: () => void;
}

/**
 * Header button + dialog showing API-key status, whether the key is sent to
 * the backend, and the running token total for the conversation. Replaces the
 * old click-to-clear key button: the key icon is green when a key is set,
 * muted otherwise, and opens this dialog where the key can be set or cleared.
 */
export function SessionStatusDialog({
  hasApiKey,
  onSetApiKey,
  onClearApiKey,
}: SessionStatusDialogProps) {
  const [open, setOpen] = useState(false);
  const usage = useConversation((s) => s.sessionUsage);

  // Key/value rows for the usage table. Reasoning is only shown when > 0
  // (models that don't report it stay clean); cached is always listed.
  const num = (n: number) => n.toLocaleString();
  const usageRows: { label: string; value: string }[] = [
    {
      label: 'Prompt (uncached)',
      value: num(Math.max(0, usage.promptTokens - usage.cachedPromptTokens)),
    },
    { label: 'Prompt (cached)', value: num(usage.cachedPromptTokens) },
    { label: 'Completion', value: num(usage.completionTokens) },
    ...(usage.reasoningTokens > 0
      ? [{ label: 'Completion (reasoning)', value: num(usage.reasoningTokens) }]
      : []),
    { label: 'Requests', value: num(usage.requests) },
    { label: 'Model', value: usage.lastModel ?? '—' },
  ];

  const handleSet = (key: string) => {
    onSetApiKey(key);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={<Button variant="ghost" size="icon" className="udi:h-7 udi:w-7" />}
            >
              <KeyRound
                className={`udi:h-3.5 udi:w-3.5 ${hasApiKey ? 'udi:text-green-600' : 'udi:text-muted-foreground'}`}
              />
            </DialogTrigger>
          }
        />
        <TooltipContent>API key &amp; usage</TooltipContent>
      </Tooltip>
      <DialogContent className="udi:max-w-md">
        <DialogHeader>
          <DialogTitle className="udi:text-sm">API Key &amp; Usage</DialogTitle>
        </DialogHeader>
        <div className="udi:flex udi:flex-col udi:gap-4">
          <section className="udi:flex udi:flex-col udi:gap-2">
            <div className="udi:flex udi:items-center udi:justify-between">
              <span className="udi:text-sm udi:font-medium">API key</span>
              <Badge
                variant={hasApiKey ? 'secondary' : 'outline'}
                className={hasApiKey ? 'udi:bg-green-600/10 udi:text-green-700' : undefined}
              >
                {hasApiKey ? 'Set' : 'Not set'}
              </Badge>
            </div>
            {hasApiKey ? (
              <div className="udi:flex udi:items-center udi:justify-between udi:gap-3">
                <p className="udi:text-xs udi:text-muted-foreground">
                  Sent to the backend on every request via the{' '}
                  <code className="udi:rounded udi:bg-muted udi:px-1 udi:py-0.5 udi:text-[11px]">
                    X-OpenAI-Key
                  </code>{' '}
                  header.
                </p>
                <Button variant="outline" size="sm" onClick={onClearApiKey}>
                  Clear key
                </Button>
              </div>
            ) : (
              <>
                <p className="udi:text-xs udi:text-muted-foreground">
                  No key set — the backend uses its own key, subject to a shared budget.
                </p>
                <ApiKeyInput onSubmit={handleSet} />
              </>
            )}
          </section>
          <section className="udi:flex udi:flex-col udi:gap-2 udi:border-t udi:pt-3">
            <div className="udi:flex udi:items-baseline udi:justify-between">
              <span className="udi:text-sm udi:font-medium">Tokens used</span>
              <span className="udi:text-lg udi:font-semibold udi:tabular-nums">
                {usage.totalTokens.toLocaleString()}
              </span>
            </div>
            <dl className="udi:flex udi:flex-col udi:gap-1 udi:text-xs">
              {usageRows.map((row) => (
                <div key={row.label} className="udi:flex udi:justify-between udi:gap-4">
                  <dt className="udi:text-muted-foreground">{row.label}</dt>
                  <dd className="udi:tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="udi:text-[11px] udi:text-muted-foreground">
              Resets when you start a new conversation.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
