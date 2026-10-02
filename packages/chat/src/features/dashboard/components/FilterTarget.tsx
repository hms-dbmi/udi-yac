import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDataPackage } from '@/app/UDIChatContext';

interface FilterTargetProps {
  entity: string;
  /** Empty for a multi-field selection, whose fields are labelled below it. */
  field: string;
  fieldOptions: string[];
  tweakable: boolean;
  onEntityChange: (entity: string | null) => void;
  onFieldChange: (field: string | null) => void;
}

/**
 * What a filter is about: its entity and field. Pickers when tweakable; fixed
 * (a brush, or the filter bar's popover) it is plain text, so it doesn't read
 * as a disabled form.
 */
export function FilterTarget({
  entity,
  field,
  fieldOptions,
  tweakable,
  onEntityChange,
  onFieldChange,
}: FilterTargetProps) {
  const entityNames = useDataPackage((s) => s.entityNames);
  const getEntityLabel = useDataPackage((s) => s.getEntityLabel);
  const getFieldLabel = useDataPackage((s) => s.getFieldLabel);

  if (!tweakable) {
    // Inline text rather than flex items, so a long label wraps between words.
    return (
      // One muted line of one weight; only the names step up to the text color.
      <p className="udi:text-sm udi:text-muted-foreground">
        Filtering{' '}
        <span className="udi:text-foreground" title={entity}>
          {getEntityLabel(entity)}
        </span>
        {field && (
          <>
            {' › '}
            <span className="udi:text-foreground" title={field}>
              {getFieldLabel(entity, field)}
            </span>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="udi:flex udi:flex-wrap udi:items-center udi:gap-1.5 udi:text-sm">
      <span className="udi:text-muted-foreground">Filtering</span>
      <Select value={entity} onValueChange={onEntityChange}>
        <SelectTrigger className="udi:h-7 udi:w-auto udi:min-w-[80px] udi:text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entityNames.map((e) => (
            <SelectItem key={e} value={e}>
              {e}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={field} onValueChange={onFieldChange}>
        <SelectTrigger className="udi:h-7 udi:w-auto udi:min-w-[80px] udi:text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fieldOptions.map((f) => (
            <SelectItem key={f} value={f}>
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
