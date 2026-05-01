import type { FlatToolCall, Message } from '@/types/messages';
import type { FreeTextExplainArgs, RebuffArgs, ClarifyVariableArgs } from '../types';
import { FreeTextExplain } from './FreeTextExplain';
import { RebuffNotice } from './RebuffNotice';
import { VisualizationCard } from './VisualizationCard';
import { FilterComponent } from './FilterComponent';
import { ClarifyVariable } from './ClarifyVariable';
import type { UDIGrammar } from 'udi-toolkit/react';
import { Badge } from '@/components/ui/badge';

interface ToolCallRendererProps {
  toolCall: FlatToolCall;
  isActive?: boolean;
  onSelectSuggestion?: (suggestion: string) => void;
  message?: Message;
  messageIndex?: number;
  toolCallIndex?: number;
}

export function ToolCallRenderer({
  toolCall,
  isActive,
  onSelectSuggestion,
  message,
  messageIndex,
  toolCallIndex,
}: ToolCallRendererProps) {
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
      return (
        <VisualizationCard
          spec={spec}
          isActive={isActive ?? false}
          title={typeof args.title === 'string' ? args.title : undefined}
          messageIndex={messageIndex}
          toolCallIndex={toolCallIndex}
        />
      );
    }
    case 'FreeTextExplain': {
      const ftArgs = args as unknown as FreeTextExplainArgs;
      return <FreeTextExplain {...ftArgs} />;
    }
    case 'Rebuff': {
      const rebuffArgs = args as unknown as RebuffArgs;
      return <RebuffNotice message={rebuffArgs.message} />;
    }
    case 'FilterData': {
      if (message && messageIndex != null) {
        return (
          <FilterComponent
            message={message}
            messageIndex={messageIndex}
            toolCallIndex={toolCallIndex}
          />
        );
      }
      return <Badge variant="secondary">Filter</Badge>;
    }
    case 'ClarifyVariable': {
      const clarifyArgs = args as unknown as ClarifyVariableArgs;
      return <ClarifyVariable {...clarifyArgs} onSelectSuggestion={onSelectSuggestion} />;
    }
    default:
      return (
        <Badge variant="outline" className="text-xs">
          {toolCall.name}
        </Badge>
      );
  }
}
