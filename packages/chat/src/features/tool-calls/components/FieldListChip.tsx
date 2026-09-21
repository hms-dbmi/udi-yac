import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FieldTooltipContent } from '@/components/FieldTooltipContent';
import { useDataPackage } from '@/app/UDIChatContext';
import { highlightMatch } from '@/utils/highlightMatch';

interface FieldListChipProps {
  entity: string;
  fields: string[];
}

interface FieldMeta {
  description: string;
  dataType: string;
  label: string;
}

const DEFAULT_VISIBLE = 5;

/**
 * Renders a field list as a compact chip cluster. The first DEFAULT_VISIBLE
 * fields are shown by default; the rest are hidden behind an expand toggle so
 * datasets with hundreds of fields (e.g. HubMap) don't flood the chat. Each
 * chip carries a tooltip with the field's description and data type, and the
 * expanded view exposes a substring filter that highlights matches.
 */
export function FieldListChip({ entity, fields }: FieldListChipProps) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const dataPackage = useDataPackage((s) => s.dataPackage);
  const getFieldLabel = useDataPackage((s) => s.getFieldLabel);

  const fieldMeta = useMemo<Record<string, FieldMeta>>(() => {
    const out: Record<string, FieldMeta> = {};
    const resource = dataPackage?.resources.find((r) => r.name === entity);
    if (!resource) return out;
    for (const f of resource.schema.fields) {
      out[f.name] = {
        description: f.description ?? '',
        dataType: f['udi:data_type'] ?? '',
        label: getFieldLabel(entity, f.name),
      };
    }
    return out;
  }, [dataPackage, entity, getFieldLabel]);

  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    if (!trimmedQuery) return fields;
    const q = trimmedQuery.toLowerCase();
    return fields.filter((f) => f.toLowerCase().includes(q));
  }, [fields, trimmedQuery]);

  if (fields.length === 0) {
    return <span className="udi:text-xs udi:text-muted-foreground">(no fields)</span>;
  }

  const visible = expanded ? filtered : filtered.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = filtered.length - DEFAULT_VISIBLE;
  const hasMore = hiddenCount > 0;

  return (
    <div className="udi:my-2 udi:rounded udi:border udi:bg-background/50 udi:p-2">
      <div className="udi:mb-1.5 udi:flex udi:items-center udi:justify-between udi:gap-2">
        <span className="udi:text-[10px] udi:font-medium udi:uppercase udi:tracking-wider udi:text-muted-foreground">
          {entity ? `${entity} fields` : 'Fields'} ({fields.length})
        </span>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="udi:h-5 udi:gap-1 udi:px-1.5 udi:text-[10px]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="udi:h-3 udi:w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="udi:h-3 udi:w-3" />
                Show all
              </>
            )}
          </Button>
        )}
      </div>
      <div className="udi:relative udi:mb-2">
        <Search className="udi:pointer-events-none udi:absolute udi:top-1/2 udi:left-2 udi:h-3 udi:w-3 udi:-translate-y-1/2 udi:text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter fields..."
          className="udi:h-7 udi:pl-7 udi:text-xs"
        />
      </div>
      <TooltipProvider delay={150} timeout={0}>
        <div className="udi:flex udi:flex-wrap udi:gap-1">
          {visible.map((field) => (
            <FieldChip key={field} field={field} meta={fieldMeta[field]} highlight={trimmedQuery} />
          ))}
          {filtered.length === 0 && (
            <span className="udi:text-[10px] udi:text-muted-foreground">
              No fields match {`"${query}"`}.
            </span>
          )}
          {!expanded && hasMore && (
            <Badge
              variant="outline"
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpanded(true);
                }
              }}
              className="udi:cursor-pointer udi:text-[10px] udi:text-muted-foreground udi:hover:bg-muted udi:hover:text-foreground"
            >
              +{hiddenCount} more
            </Badge>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}

interface FieldChipProps {
  field: string;
  meta: FieldMeta | undefined;
  highlight: string;
}

function FieldChip({ field, meta, highlight }: FieldChipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="secondary"
            className="udi:max-w-[250px] udi:cursor-default udi:font-mono udi:text-[10px]"
          >
            <span className="udi:min-w-0 udi:truncate">{highlightMatch(field, highlight)}</span>
            <Info className="udi:shrink-0 udi:opacity-60" />
          </Badge>
        }
      />
      <FieldTooltipContent
        field={field}
        label={meta?.label}
        dataType={meta?.dataType}
        description={meta?.description}
      />
    </Tooltip>
  );
}
