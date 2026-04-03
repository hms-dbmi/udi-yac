import type { FlatToolCall } from '@/types/messages';
import type { FreeTextExplainArgs, RebuffArgs } from '@/types/toolCallArgs';
import { FreeTextExplain } from '@/components/tool-calls/FreeTextExplain';
import { RebuffNotice } from '@/components/tool-calls/RebuffNotice';
import { VisualizationCard } from '@/components/tool-calls/VisualizationCard';
import type { UDIGrammar } from 'udi-toolkit/react';
import { Badge } from '@/components/ui/badge';

interface ToolCallRendererProps {
  toolCall: FlatToolCall;
  isPinned?: boolean;
  onSelectSuggestion?: (suggestion: string) => void;
}

export function ToolCallRenderer({ toolCall, isPinned, onSelectSuggestion }: ToolCallRendererProps) {
  const args = toolCall.arguments;

  switch (toolCall.name) {
    case 'RenderVisualization': {
      let spec: UDIGrammar | null = null;
      if (typeof args.spec === 'string') {
        try {
          spec = JSON.parse(args.spec);
        } catch {
          /* empty */
        }
      }
      if (!spec) return <Badge variant="secondary">Visualization (invalid spec)</Badge>;
      return <VisualizationCard spec={spec} isPinned={isPinned ?? false} title={args.title} />;
    }
    case 'FreeTextExplain': {
      const ftArgs = args as unknown as FreeTextExplainArgs;
      return <FreeTextExplain {...ftArgs} />;
    }
    case 'Rebuff': {
      const rebuffArgs = args as unknown as RebuffArgs;
      return <RebuffNotice {...rebuffArgs} onSelectSuggestion={onSelectSuggestion} />;
    }
    default:
      return (
        <Badge variant="outline" className="text-xs">
          {toolCall.name}
        </Badge>
      );
  }
}
