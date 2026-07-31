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
import { useDataPackage, useDataFilters, useTracker } from '@/app/UDIChatContext';
import type { DataSelection } from '@/features/dashboard';
import type { PointSelection } from 'udi-toolkit/react';

interface PointFilterComponentProps {
  dataSelection: DataSelection;
  tweakable: boolean;
  filterKey: string;
  /**
   * Optional override for where an edit is written. Defaults to
   * `dataFiltersStore.setDataSelection(filterKey, …)` (the LLM-filter path).
   * Brush-originated filters pass a writer that targets the brush store.
   */
  onCommit?: (selection: DataSelection) => void;
}

export function PointFilterComponent({
  dataSelection,
  tweakable,
  filterKey,
  onCommit,
}: PointFilterComponentProps) {
  const entityNames = useDataPackage((s) => s.entityNames);
  const categoricalSourceFields = useDataPackage((s) => s.categoricalSourceFields);
  const getDomainForField = useDataPackage((s) => s.getDomainForField);
  const isValidPointFilter = useDataPackage((s) => s.isValidPointFilter);
  const setDataSelection = useDataFilters((s) => s.setDataSelection);
  const trackEvent = useTracker();

  const entity = dataSelection.dataSourceKey;
  // Chart clicks produce MULTI-field point selections (e.g. a stacked-bar
  // segment selects {organization_name: [...], event_type: [...]}); the LLM
  // FilterData path produces single-field ones. Render a multiselect per
  // field. The entity/field pickers only make sense for the single-field
  // tweakable (LLM) form.
  const allFields = Object.keys(dataSelection.selection ?? {});
  const field = allFields.length === 1 ? allFields[0] : '';

  const selectedValuesOf = (f: string) => (dataSelection.selection?.[f] ?? []) as string[];

  // Options per field: the field's domain when known; otherwise (e.g. a
  // high-cardinality field whose domain was dropped by removeLongDomains)
  // fall back to the selected values so a chart click still renders as a
  // usable multiselect instead of an error.
  const optionsOf = (f: string): string[] => {
    const domain = getDomainForField(entity, f);
    const values = (domain?.domain as { values: string[] } | undefined)?.values;
    if (values && values.length > 0) return values;
    return selectedValuesOf(f);
  };

  const selectedValues = field ? selectedValuesOf(field) : [];

  // Error only for the genuinely broken cases: no fields at all, or an LLM
  // (tweakable) single-field filter whose values fail domain validation.
  // Brush-origin selections came from real chart data — always renderable.
  const isValid =
    allFields.length > 0 &&
    (!tweakable || !field || isValidPointFilter(entity, field, selectedValues).isValid !== 'no');

  const commit = (selection: DataSelection) => {
    if (onCommit) onCommit(selection);
    else setDataSelection(filterKey, selection);
  };

  const handleToggle = (f: string, value: string, checked: boolean) => {
    const values = selectedValuesOf(f);
    const next = checked ? [...values, value] : values.filter((v) => v !== value);
    const current = (dataSelection.selection ?? {}) as PointSelection;
    const nextSelection: PointSelection = { ...current, [f]: next };
    commit({ ...dataSelection, selection: nextSelection });
    trackEvent('filter_selection_changed', {
      entity,
      field: f,
      action: 'toggle',
      checked,
      selectionCount: next.length,
    });
  };

  const handleClearAll = (f: string) => {
    const current = (dataSelection.selection ?? {}) as PointSelection;
    const nextSelection: PointSelection = { ...current, [f]: [] };
    commit({ ...dataSelection, selection: nextSelection });
    trackEvent('filter_selection_changed', {
      entity,
      field: f,
      action: 'clear_all',
      selectionCount: 0,
    });
  };

  const handleEntityChange = (val: string | null) => {
    if (!val) return;
    commit({
      ...dataSelection,
      dataSourceKey: val,
      selection: field ? { [field]: [] } : {},
    });
    trackEvent('filter_entity_changed', {
      filterType: 'point',
      entity: val,
      field,
    });
  };

  const handleFieldChange = (val: string | null) => {
    if (!val) return;
    commit({
      ...dataSelection,
      selection: { [val]: [] },
    });
    trackEvent('filter_field_changed', {
      filterType: 'point',
      entity,
      field: val,
    });
  };

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
        <div className="space-y-2">
          {allFields.map((f) => {
            const values = selectedValuesOf(f);
            return (
              <div key={f} className="space-y-1.5">
                {allFields.length > 1 && (
                  <div className="text-xs font-medium text-muted-foreground">{f}</div>
                )}
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {optionsOf(f).map((value) => {
                    const label = value == null ? '<null>' : String(value);
                    const id = `${filterKey}-${f}-${value}`;
                    return (
                      <div key={value ?? '__null__'} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={values.includes(value)}
                          onCheckedChange={(checked) => handleToggle(f, value, !!checked)}
                        />
                        <Label htmlFor={id} className="text-xs cursor-pointer">
                          {label}
                        </Label>
                      </div>
                    );
                  })}
                  {values.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => handleClearAll(f)}
                    >
                      Clear all
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="text-sm text-destructive">Error: Invalid filter.</span>
      )}
    </div>
  );
}
