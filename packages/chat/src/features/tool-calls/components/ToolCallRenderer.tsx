import type { FlatToolCall, Message } from '@/types/messages';
import type {
  FreeTextExplainArgs,
  RebuffArgs,
  OfferIssueReportArgs,
  UpdateDashboardArgs,
  ResetConversationArgs,
} from '../types';
import { FreeTextExplain } from './FreeTextExplain';
import { RebuffNotice } from './RebuffNotice';
import { VisualizationCard } from './VisualizationCard';
import { FilterComponent } from './FilterComponent';
import { IssueReportOffer } from './IssueReportOffer';
import { ResetConversationOffer } from './ResetConversationOffer';
import type { UDIGrammar } from 'udi-toolkit/react';
import { Badge } from '@/components/ui/badge';

interface ToolCallRendererProps {
  toolCall: FlatToolCall;
  isActive?: boolean;
  message?: Message;
  messageIndex?: number;
  toolCallIndex?: number;
}

export function ToolCallRenderer({
  toolCall,
  isActive,
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
      if (message) return <FilterComponent message={message} toolCallIndex={toolCallIndex} />;
      return <Badge variant="secondary">Filter</Badge>;
    }
    case 'OfferIssueReport': {
      const offerArgs = args as unknown as OfferIssueReportArgs;
      return <IssueReportOffer {...offerArgs} />;
    }
    case 'UpdateDashboard': {
      // Already carried out; the charts' own cards show where they went.
      const { message } = args as unknown as UpdateDashboardArgs;
      return <RebuffNotice message={message} />;
    }
    case 'ResetConversation': {
      const { message } = args as unknown as ResetConversationArgs;
      return <ResetConversationOffer message={message} />;
    }
    default:
      return (
        <Badge variant="outline" className="udi:text-xs">
          {toolCall.name}
        </Badge>
      );
  }
}
