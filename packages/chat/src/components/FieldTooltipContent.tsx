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
    <TooltipContent className="udi:max-w-sm udi:flex-col udi:items-start udi:gap-1 udi:px-3 udi:py-2 udi:text-xs">
      {showLabel && <span className="udi:font-medium">{label}</span>}
      <div className="udi:flex udi:items-center udi:gap-1.5">
        <span className="udi:font-mono udi:font-medium">{field}</span>
        {dataType && (
          <Badge
            variant="outline"
            className="udi:border-background/30 udi:text-[9px] udi:text-background"
          >
            {dataType}
          </Badge>
        )}
      </div>
      {description && (
        <p className="udi:text-[11px] udi:leading-snug udi:text-background/80">{description}</p>
      )}
    </TooltipContent>
  );
}
