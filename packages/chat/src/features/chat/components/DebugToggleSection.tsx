import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useConversation, useGlobal } from '@/app/UDIChatContext';

interface DebugToggleSectionProps {
  showSystemPrompts: boolean;
  onShowSystemPromptsChange: (value: boolean) => void;
}

/**
 * Debug-mode-only toggle row for controlling the visibility of system
 * messages in the transcript. Gated internally on `global.debugMode` and
 * subscribes to `conversation.messages` only to detect whether system
 * messages exist — both subscriptions are kept here so the parent
 * ChatPanel does not re-render when debug mode toggles or messages change.
 */
export function DebugToggleSection({
  showSystemPrompts,
  onShowSystemPromptsChange,
}: DebugToggleSectionProps) {
  const debugMode = useGlobal((s) => s.debugMode);
  const messages = useConversation((s) => s.messages);

  if (!debugMode) return null;

  const hasSystemMessages = messages.some((m) => m.role === 'system');

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/50 border-b">
      <div className="flex items-center gap-1.5">
        <Switch
          id="system-prompts"
          checked={showSystemPrompts}
          onCheckedChange={(v) => onShowSystemPromptsChange(!!v)}
          disabled={!hasSystemMessages}
        />
        <Label htmlFor="system-prompts" className="text-[10px] text-muted-foreground">
          System Prompts{!hasSystemMessages && ' (none)'}
        </Label>
      </div>
    </div>
  );
}
