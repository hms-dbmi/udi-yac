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
            <DialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
              <KeyRound
                className={`h-3.5 w-3.5 ${hasApiKey ? 'text-green-600' : 'text-muted-foreground'}`}
              />
            </DialogTrigger>
          }
        />
        <TooltipContent>API key &amp; usage</TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">API Key &amp; Usage</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">API key</span>
              <Badge
                variant={hasApiKey ? 'secondary' : 'outline'}
                className={hasApiKey ? 'bg-green-600/10 text-green-700' : undefined}
              >
                {hasApiKey ? 'Set' : 'Not set'}
              </Badge>
            </div>
            {hasApiKey ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Sent to the backend on every request via the{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">X-OpenAI-Key</code>{' '}
                  header.
                </p>
                <Button variant="outline" size="sm" onClick={onClearApiKey}>
                  Clear key
                </Button>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  No key set — the backend uses its own key, subject to a shared budget.
                </p>
                <ApiKeyInput onSubmit={handleSet} />
              </>
            )}
          </section>
          <section className="flex flex-col gap-2 border-t pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Tokens used</span>
              <span className="text-lg font-semibold tabular-nums">
                {usage.totalTokens.toLocaleString()}
              </span>
            </div>
            <dl className="flex flex-col gap-1 text-xs">
              {usageRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-muted-foreground">
              Resets when you start a new conversation.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
