import { useMemo, useCallback } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useDataPackage, useDataFilters } from '@/app/UDIChatContext';
import type { DataSelection } from '@/features/dashboard';
import type { PointSelection } from 'udi-toolkit/react';

interface PointFilterComponentProps {
  dataSelection: DataSelection;
  tweakable: boolean;
  filterKey: string;
}

export function PointFilterComponent({
  dataSelection,
  tweakable,
  filterKey,
}: PointFilterComponentProps) {
  const entityNames = useDataPackage((s) => s.entityNames);
  const categoricalSourceFields = useDataPackage((s) => s.categoricalSourceFields);
  const getDomainForField = useDataPackage((s) => s.getDomainForField);
  const isValidPointFilter = useDataPackage((s) => s.isValidPointFilter);
  const setDataSelection = useDataFilters((s) => s.setDataSelection);

  const entity = dataSelection.dataSourceKey;
  const allFields = Object.keys(dataSelection.selection ?? {});
  const field = allFields.length === 1 ? allFields[0] : '';

  const selectedValues = useMemo(() => {
    if (!field) return [] as string[];
    return (dataSelection.selection?.[field] ?? []) as string[];
  }, [dataSelection.selection, field]);

  const domainValues = useMemo(() => {
    if (!field) return [] as string[];
    const domain = getDomainForField(entity, field);
    return (domain?.domain as { values: string[] })?.values ?? [];
  }, [getDomainForField, entity, field]);

  const isValid = field
    ? isValidPointFilter(entity, field, selectedValues).isValid === 'yes'
    : false;

  const handleToggle = useCallback(
    (value: string, checked: boolean) => {
      if (!field) return;
      const next = checked ? [...selectedValues, value] : selectedValues.filter((v) => v !== value);
      const current = (dataSelection.selection ?? {}) as PointSelection;
      const nextSelection: PointSelection = { ...current, [field]: next };
      setDataSelection(filterKey, { ...dataSelection, selection: nextSelection });
    },
    [setDataSelection, filterKey, dataSelection, field, selectedValues],
  );

  const handleClearAll = useCallback(() => {
    if (!field) return;
    const current = (dataSelection.selection ?? {}) as PointSelection;
    const nextSelection: PointSelection = { ...current, [field]: [] };
    setDataSelection(filterKey, { ...dataSelection, selection: nextSelection });
  }, [setDataSelection, filterKey, dataSelection, field]);

  const handleEntityChange = useCallback(
    (val: string | null) => {
      if (!val) return;
      setDataSelection(filterKey, {
        ...dataSelection,
        dataSourceKey: val,
        selection: field ? { [field]: [] } : {},
      });
    },
    [setDataSelection, filterKey, dataSelection, field],
  );

  const handleFieldChange = useCallback(
    (val: string | null) => {
      if (!val) return;
      setDataSelection(filterKey, {
        ...dataSelection,
        selection: { [val]: [] },
      });
    },
    [setDataSelection, filterKey, dataSelection],
  );

  const fieldOptions = categoricalSourceFields?.[entity] ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        {tweakable ? (
          <>
            <span className="text-muted-foreground">Filtering</span>
            <Select value={entity} onValueChange={handleEntityChange}>
              <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
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
            <Select value={field} onValueChange={handleFieldChange}>
              <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
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
          </>
        ) : (
          <span className="text-muted-foreground">
            Filtering {entity} {field}
          </span>
        )}
      </div>
      {isValid ? (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {domainValues.map((value) => {
            const label = value == null ? '<null>' : String(value);
            const id = `${filterKey}-${field}-${value}`;
            return (
              <div key={value ?? '__null__'} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={selectedValues.includes(value)}
                  onCheckedChange={(checked) => handleToggle(value, !!checked)}
                />
                <Label htmlFor={id} className="text-xs cursor-pointer">
                  {label}
                </Label>
              </div>
            );
          })}
          {selectedValues.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleClearAll}>
              Clear all
            </Button>
          )}
        </div>
      ) : (
        <span className="text-sm text-destructive">Error: Invalid filter.</span>
      )}
    </div>
  );
}
