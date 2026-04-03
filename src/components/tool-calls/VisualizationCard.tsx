import { useMemo } from 'react';
import { UDIVis } from 'udi-toolkit/react';
import type { UDIGrammar } from 'udi-toolkit/react';
import { Badge } from '@/components/ui/badge';

interface VisualizationCardProps {
  spec: UDIGrammar;
  isPinned: boolean;
  title?: string;
}

export function VisualizationCard({ spec, isPinned, title }: VisualizationCardProps) {
  // When pinned, show a small thumbnail in the chat
  const displaySpec = useMemo(() => spec, [spec]);

  if (isPinned) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Badge variant="secondary" className="text-xs">
          Pinned to dashboard
        </Badge>
        {title && <span className="text-xs text-muted-foreground truncate">{title}</span>}
        <div className="w-[60px] h-[30px] overflow-hidden">
          <div className="w-[200px] origin-top-left scale-[0.2]">
            <UDIVis spec={displaySpec} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-1">
      {title && <p className="text-xs font-medium mb-1">{title}</p>}
      <div className="w-full max-w-[300px]">
        <UDIVis spec={displaySpec} />
      </div>
    </div>
  );
}
