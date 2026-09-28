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
    <div className="udi:flex udi:items-center udi:gap-3 udi:px-3 udi:py-1.5 udi:bg-muted/50 udi:border-b">
      <div className="udi:flex udi:items-center udi:gap-1.5">
        <Switch
          id="system-prompts"
          checked={showSystemPrompts}
          onCheckedChange={(v) => onShowSystemPromptsChange(!!v)}
          disabled={!hasSystemMessages}
        />
        <Label htmlFor="system-prompts" className="udi:text-[10px] udi:text-muted-foreground">
          System Prompts{!hasSystemMessages && ' (none)'}
        </Label>
      </div>
    </div>
  );
}
