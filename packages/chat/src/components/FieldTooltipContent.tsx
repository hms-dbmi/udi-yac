import { Badge } from '@/components/ui/badge';
import { TooltipContent } from '@/components/ui/tooltip';

interface FieldTooltipContentProps {
  field: string;
  /** The package's friendly label, when it says something the column name
   *  doesn't (`body_mass_index_value` → "BMI"). Shown above the raw name
   *  rather than replacing it — you hover a field to learn what it is called. */
  label?: string | undefined;
  dataType?: string | undefined;
  description?: string | undefined;
}

/**
 * The hover card for a data-package field: its name, its `udi:data_type`, and
 * its description. Shared by the chat's field chips and the data overview's
 * field list so a field looks the same wherever it is hovered.
 */
export function FieldTooltipContent({
  field,
  label,
  dataType,
  description,
}: FieldTooltipContentProps) {
  const showLabel = !!label && label !== field;
  return (
    <TooltipContent className="max-w-sm flex-col items-start gap-1 px-3 py-2 text-xs">
      {showLabel && <span className="font-medium">{label}</span>}
      <div className="flex items-center gap-1.5">
        <span className="font-mono font-medium">{field}</span>
        {dataType && (
          <Badge variant="outline" className="border-background/30 text-[9px] text-background">
            {dataType}
          </Badge>
        )}
      </div>
      {description && <p className="text-[11px] leading-snug text-background/80">{description}</p>}
    </TooltipContent>
  );
}
