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
    return <span className="text-xs text-muted-foreground">(no fields)</span>;
  }

  const visible = expanded ? filtered : filtered.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = filtered.length - DEFAULT_VISIBLE;
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
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter fields..."
          className="h-7 pl-7 text-xs"
        />
      </div>
      <TooltipProvider delay={150} timeout={0}>
        <div className="flex flex-wrap gap-1">
          {visible.map((field) => (
            <FieldChip key={field} field={field} meta={fieldMeta[field]} highlight={trimmedQuery} />
          ))}
          {filtered.length === 0 && (
            <span className="text-[10px] text-muted-foreground">
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
              className="cursor-pointer text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
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
          <Badge variant="secondary" className="max-w-[250px] cursor-default font-mono text-[10px]">
            <span className="min-w-0 truncate">{highlightMatch(field, highlight)}</span>
            <Info className="shrink-0 opacity-60" />
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
