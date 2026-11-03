import { useCallback, useId, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDataPackage, useDataFilters, useTracker } from '@/app/UDIChatContext';
import { highlightMatch } from '@/utils/highlightMatch';
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
}

export function PointFilterComponent({
  dataSelection,
  tweakable,
  filterKey,
  onCommit,
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

  // Stable, so a field's search doesn't refilter on every render.
  const labelOf = useCallback(
    (value: string) => (value == null ? '<null>' : getValueLabel(String(value))),
    [getValueLabel],
  );

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

  // The select-all row. Checking every value and checking none both take in
  // every row, but they are two different places to start from: none, then
  // tick the one value wanted; all, then untick the one to leave out.
  const handleSetAll = (f: string, all: boolean) => {
    const current = (dataSelection.selection ?? {}) as PointSelection;
    const next = all ? optionsOf(f) : [];
    commit({ ...dataSelection, selection: { ...current, [f]: next } });
    trackEvent('filter_selection_changed', {
      entity,
      field: f,
      action: all ? 'select_all' : 'clear_all',
      selectionCount: next.length,
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
          {allFields.map((f, fieldIndex) => (
            <FieldValueList
              key={f}
              heading={allFields.length > 1 ? getFieldLabel(entity, f) : null}
              options={optionsOf(f)}
              selected={selectedValuesOf(f)}
              labelOf={labelOf}
              idPrefix={`${idPrefix}-${fieldIndex}`}
              onToggle={(value, checked) => handleToggle(f, value, checked)}
              onSetAll={(all) => handleSetAll(f, all)}
            />
          ))}
        </div>
      ) : (
        <span className="udi:text-sm udi:text-destructive">Error: Invalid filter.</span>
      )}
    </div>
  );
}

/** More options than this and a field gets a search box. */
const SEARCH_THRESHOLD = 10;
/** Chips show for at most this many selected values, and only on a field with
 *  more options than this: on a short list the checkboxes already show it all. */
const CHIP_LIMIT = 10;

interface FieldValueListProps {
  /** The field's label, for a multi-field selection; null for a single one. */
  heading: string | null;
  options: string[];
  selected: string[];
  labelOf: (value: string) => string;
  /** Unique to this field in this instance; checkbox ids extend it. */
  idPrefix: string;
  onToggle: (value: string, checked: boolean) => void;
  onSetAll: (all: boolean) => void;
}

/**
 * One field's values: the select-all row, the selected values as chips when
 * they are a few out of many, a search box on a long list, and the checkboxes.
 * The search only hides rows; it never changes the filter.
 */
function FieldValueList({
  heading,
  options,
  selected,
  labelOf,
  idPrefix,
  onToggle,
  onSetAll,
}: FieldValueListProps) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  // Indexes into the full list, so a row keeps its checkbox id while the
  // search hides the others.
  const visible = useMemo(() => {
    const all = options.map((value, index) => ({ value, index }));
    if (!trimmed) return all;
    const q = trimmed.toLowerCase();
    return all.filter(
      ({ value }) =>
        labelOf(value).toLowerCase().includes(q) ||
        (value != null && String(value).toLowerCase().includes(q)),
    );
  }, [options, trimmed, labelOf]);

  const checkedCount = options.filter((o) => selected.includes(o)).length;
  const allChecked = options.length > 0 && checkedCount === options.length;
  const allId = `${idPrefix}-all`;
  const showChips =
    options.length > CHIP_LIMIT && selected.length > 0 && selected.length <= CHIP_LIMIT;

  return (
    <div className="udi:space-y-1.5">
      {heading && (
        <div className="udi:text-xs udi:font-medium udi:text-muted-foreground">{heading}</div>
      )}
      {/* Select all / none, mixed while some are checked; a click
          from mixed checks the rest. The count says how much of
          the list is out of view. Outside the scroll, so it stays. */}
      <div className="udi:flex udi:h-6 udi:items-center udi:gap-2 udi:border-b udi:border-border">
        <Checkbox
          id={allId}
          checked={allChecked}
          indeterminate={checkedCount > 0 && !allChecked}
          onCheckedChange={(checked) => onSetAll(!!checked)}
        />
        <Label
          htmlFor={allId}
          className="udi:text-xs udi:font-normal udi:text-muted-foreground udi:cursor-pointer"
        >
          {checkedCount} of {options.length} selected
        </Label>
      </div>
      {/* What's checked, at a glance, when it is a few rows somewhere in a
          long list. In addition to the checkboxes, never instead of them. */}
      {showChips && (
        <div className="udi:flex udi:flex-wrap udi:gap-1">
          {selected.map((value) => {
            const label = labelOf(value);
            return (
              <Badge
                key={value ?? '__null__'}
                variant="secondary"
                className="udi:max-w-full udi:pr-0.5"
                title={label}
              >
                <span className="udi:truncate">{label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  className="udi:rounded-full udi:p-0.5 udi:hover:bg-muted-foreground/20"
                  onClick={() => onToggle(value, false)}
                >
                  <X aria-hidden className="udi:size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      {options.length > SEARCH_THRESHOLD && (
        <div className="udi:relative">
          <Search className="udi:pointer-events-none udi:absolute udi:top-1/2 udi:left-2 udi:h-3 udi:w-3 udi:-translate-y-1/2 udi:text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search values..."
            aria-label="Search values"
            className="udi:h-7 udi:pl-7 udi:text-xs"
          />
        </div>
      )}
      {/* Rows are 1.5rem, and the list's height a whole number of
          them plus half, so a list that scrolls visibly cuts its
          last row in two. --udi-filter-rows sets the count (the
          chip popover asks for more). The edge shadows say the
          same where a half row alone is easy to miss. */}
      <ScrollArea
        scrollShadow
        viewportClassName="udi:max-h-[calc((var(--udi-filter-rows,8)_+_0.5)_*_1.5rem)]"
      >
        {visible.map(({ value, index }) => {
          // Display only — `value` itself still goes into the filter.
          const label = labelOf(value);
          // Indexes, not names: values and fields hold spaces,
          // which make an invalid id.
          const id = `${idPrefix}-${index}`;
          return (
            <div key={value ?? '__null__'} className="udi:flex udi:h-6 udi:items-center udi:gap-2">
              {/* The checkbox's hit area reaches 8px past its
                  16px box by default, which on the last row spills
                  out of the list and makes even a short one scroll.
                  4px fills the 24px row exactly. */}
              <Checkbox
                id={id}
                className="udi:after:-inset-y-1"
                checked={selected.includes(value)}
                onCheckedChange={(checked) => onToggle(value, !!checked)}
              />
              {/* One line, so every row is the same height and the
                  half-row cut lands mid-row; the full text is the
                  title. */}
              <Label
                htmlFor={id}
                title={label}
                className="udi:min-w-0 udi:text-xs udi:cursor-pointer"
              >
                <span className="udi:truncate">{highlightMatch(label, trimmed)}</span>
              </Label>
            </div>
          );
        })}
        {visible.length === 0 && (
          <span className="udi:text-xs udi:text-muted-foreground">
            No values match {`"${trimmed}"`}.
          </span>
        )}
      </ScrollArea>
      {trimmed && visible.length > 0 && (
        <span className="udi:text-2xs udi:text-muted-foreground">
          {visible.length} of {options.length} shown
        </span>
      )}
    </div>
  );
}
