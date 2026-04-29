import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDataPackage } from '@/app/UDIChatContext';

interface FieldListChipProps {
  entity: string;
  fields: string[];
}

interface FieldMeta {
  description: string;
  dataType: string;
}

const DEFAULT_VISIBLE = 5;

/**
 * Renders a field list as a compact chip cluster. The first DEFAULT_VISIBLE
 * fields are shown by default; the rest are hidden behind an expand toggle so
 * datasets with hundreds of fields (e.g. HubMap) don't flood the chat. Each
 * chip carries a tooltip with the field's description and data type.
 */
export function FieldListChip({ entity, fields }: FieldListChipProps) {
  const [expanded, setExpanded] = useState(false);
  const dataPackage = useDataPackage((s) => s.dataPackage);

  const fieldMeta = useMemo<Record<string, FieldMeta>>(() => {
    const out: Record<string, FieldMeta> = {};
    const resource = dataPackage?.resources.find((r) => r.name === entity);
    if (!resource) return out;
    for (const f of resource.schema.fields) {
      out[f.name] = {
        description: f.description ?? '',
        dataType: f['udi:data_type'] ?? '',
      };
    }
    return out;
  }, [dataPackage, entity]);

  if (fields.length === 0) {
    return <span className="text-xs text-muted-foreground">(no fields)</span>;
  }

  const visible = expanded ? fields : fields.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = fields.length - DEFAULT_VISIBLE;
  const hasMore = hiddenCount > 0;

  return (
    <div className="my-2 rounded border bg-background/50 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {entity ? `${entity} fields` : 'Fields'} ({fields.length})
        </span>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 gap-1 px-1.5 text-[10px]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Show all
              </>
            )}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {visible.map((field) => (
          <FieldChip key={field} field={field} meta={fieldMeta[field]} />
        ))}
        {!expanded && hasMore && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            +{hiddenCount} more
          </Badge>
        )}
      </div>
    </div>
  );
}

interface FieldChipProps {
  field: string;
  meta: FieldMeta | undefined;
}

function FieldChip({ field, meta }: FieldChipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="secondary" className="cursor-default font-mono text-[10px]">
            <span>{field}</span>
            <Info className="h-2.5 w-2.5 opacity-60" />
          </Badge>
        }
      />
      <TooltipContent className="max-w-sm flex-col items-start gap-1 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-medium">{field}</span>
          {meta?.dataType && (
            <Badge variant="outline" className="border-background/30 text-[9px] text-background">
              {meta.dataType}
            </Badge>
          )}
        </div>
        {meta?.description && (
          <p className="text-[11px] leading-snug text-background/80">{meta.description}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
