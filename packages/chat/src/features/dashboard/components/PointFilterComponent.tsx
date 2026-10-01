import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useDataPackage, useDataFilters, useTracker } from '@/app/UDIChatContext';
import type { DataSelection } from '../stores/dataFiltersStore';
import { FilterTarget } from './FilterTarget';
import type { PointSelection } from 'udi-toolkit/react';

interface PointFilterComponentProps {
  dataSelection: DataSelection;
  tweakable: boolean;
  filterKey: string;
  /**
   * Optional override for where an edit is written. Defaults to
   * `dataFiltersStore.setFilter(filterKey, …)`, which routes by filter id.
   * Brush-originated filters pass a writer that targets the brush store.
   */
  onCommit?: (selection: DataSelection) => void;
  /** Drop the inline "Clear all" — the filter bar's popover has its own. */
  hideClearAll?: boolean;
}

export function PointFilterComponent({
  dataSelection,
  tweakable,
  filterKey,
  onCommit,
  hideClearAll = false,
}: PointFilterComponentProps) {
  const categoricalSourceFields = useDataPackage((s) => s.categoricalSourceFields);
  const getDomainForField = useDataPackage((s) => s.getDomainForField);
  const isValidPointFilter = useDataPackage((s) => s.isValidPointFilter);
  const getFieldLabel = useDataPackage((s) => s.getFieldLabel);
  const getValueLabel = useDataPackage((s) => s.getValueLabel);
  const setFilter = useDataFilters((s) => s.setFilter);
  const trackEvent = useTracker();
  // Per instance, not per filter: the same filter renders in its chat widget
  // and in its chip's popover at once, and a label pointing at the other
  // copy's checkbox would toggle that one instead — a click outside the
  // popover, which then closes.
  const idPrefix = useId();

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
    else setFilter(filterKey, selection);
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

  // Base UI's Select fires `onValueChange` on every item press, including a
  // press on the already-selected item — a common way to dismiss the menu.
  // Both handlers below clear the checked values, so an unguarded re-commit
  // would wipe the selection just from opening and closing the menu. Bail out
  // when the value hasn't actually changed.
  const handleEntityChange = (val: string | null) => {
    if (!val || val === entity) return;
    // The field belongs to the entity being committed: keep the current one
    // when the new entity has it, otherwise fall back to that entity's first
    // categorical field. Only when it has none does the field carry over
    // unchanged, leaving the widget to surface the invalid state.
    const newFieldOptions = categoricalSourceFields?.[val] ?? [];
    const nextField = newFieldOptions.includes(field) ? field : (newFieldOptions[0] ?? field);
    commit({
      ...dataSelection,
      dataSourceKey: val,
      selection: nextField ? { [nextField]: [] } : {},
    });
    trackEvent('filter_entity_changed', {
      filterType: 'point',
      entity: val,
      field: nextField,
    });
  };

  const handleFieldChange = (val: string | null) => {
    if (!val || val === field) return;
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
    <div className="udi:space-y-2">
      <FilterTarget
        entity={entity}
        field={field}
        fieldOptions={fieldOptions}
        tweakable={tweakable}
        onEntityChange={handleEntityChange}
        onFieldChange={handleFieldChange}
      />
      {isValid ? (
        <div className="udi:space-y-2">
          {allFields.map((f, fieldIndex) => {
            const values = selectedValuesOf(f);
            return (
              <div key={f} className="udi:space-y-1.5">
                {allFields.length > 1 && (
                  <div className="udi:text-xs udi:font-medium udi:text-muted-foreground">
                    {getFieldLabel(entity, f)}
                  </div>
                )}
                {/* Rows are 1.5rem, and the list's height a whole number of
                    them plus half, so a list that scrolls visibly cuts its
                    last row in two. --udi-filter-rows sets the count (the
                    chip popover asks for more). The Clear all below the
                    values is a row too. */}
                <div className="udi:max-h-[calc((var(--udi-filter-rows,8)_+_0.5)_*_1.5rem)] udi:overflow-y-auto">
                  {optionsOf(f).map((value, i) => {
                    // Display only — `value` itself still goes into the filter.
                    const label = value == null ? '<null>' : getValueLabel(String(value));
                    // Indexes, not names: values and fields hold spaces,
                    // which make an invalid id.
                    const id = `${idPrefix}-${fieldIndex}-${i}`;
                    return (
                      <div
                        key={value ?? '__null__'}
                        className="udi:flex udi:h-6 udi:items-center udi:gap-2"
                      >
                        <Checkbox
                          id={id}
                          checked={values.includes(value)}
                          onCheckedChange={(checked) => handleToggle(f, value, !!checked)}
                        />
                        {/* One line, so every row is the same height and the
                            half-row cut lands mid-row; the full text is the
                            title. */}
                        <Label
                          htmlFor={id}
                          title={label}
                          className="udi:min-w-0 udi:text-xs udi:cursor-pointer"
                        >
                          <span className="udi:truncate">{label}</span>
                        </Label>
                      </div>
                    );
                  })}
                  {!hideClearAll && values.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="udi:h-6 udi:text-xs"
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
        <span className="udi:text-sm udi:text-destructive">Error: Invalid filter.</span>
      )}
    </div>
  );
}
