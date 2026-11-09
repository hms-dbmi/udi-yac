import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConversation } from '@/app/UDIChatContext';
import { cn } from '@/lib/utils';
import { ApiKeyInput } from './ApiKeyInput';

interface SessionStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowApiKey: boolean;
  hasApiKey: boolean;
  onSetApiKey: (key: string) => void;
  onClearApiKey: () => void;
}

/**
 * Dialog showing API-key status, whether the key is sent to the backend, and
 * the running token total for the conversation, opened from the chat header's
 * menu. The key can be set or cleared here. Without `allowApiKey`, only the
 * token total shows.
 */
export function SessionStatusDialog({
  open,
  onOpenChange,
  allowApiKey,
  hasApiKey,
  onSetApiKey,
  onClearApiKey,
}: SessionStatusDialogProps) {
  const usage = useConversation((s) => s.sessionUsage);

  // Key/value rows for the usage table. Cache writes and reasoning are only
  // shown when > 0 (models that don't report them stay clean); cached is always
  // listed. Cache writes are billed at a premium, so they are split out of the
  // uncached figure rather than counted twice.
  const num = (n: number) => n.toLocaleString();
  const usageRows: { label: string; value: string }[] = [
    {
      label: 'Prompt (uncached)',
      value: num(
        Math.max(0, usage.promptTokens - usage.cachedPromptTokens - usage.cacheWriteTokens),
      ),
    },
    { label: 'Prompt (cached)', value: num(usage.cachedPromptTokens) },
    ...(usage.cacheWriteTokens > 0
      ? [{ label: 'Prompt (cache write)', value: num(usage.cacheWriteTokens) }]
      : []),
    { label: 'Completion', value: num(usage.completionTokens) },
    ...(usage.reasoningTokens > 0
      ? [{ label: 'Completion (reasoning)', value: num(usage.reasoningTokens) }]
      : []),
    { label: 'Requests', value: num(usage.requests) },
    { label: 'Model', value: usage.lastModel ?? '—' },
  ];

  const handleSet = (key: string) => {
    onSetApiKey(key);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="udi:max-w-md">
        <DialogHeader>
          <DialogTitle className="udi:text-sm">
            {allowApiKey ? 'API Key & Usage' : 'Usage'}
          </DialogTitle>
        </DialogHeader>
        <div className="udi:flex udi:flex-col udi:gap-4">
          {allowApiKey && (
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
                    <code className="udi:rounded udi:bg-muted udi:px-1 udi:py-0.5 udi:text-xs">
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
          )}
          <section
            className={cn(
              'udi:flex udi:flex-col udi:gap-2',
              allowApiKey && 'udi:border-t udi:pt-3',
            )}
          >
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
            <p className="udi:text-xs udi:text-muted-foreground">
              Resets when you start a new conversation.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
