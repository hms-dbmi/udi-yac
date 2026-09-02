import { AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDataPackage, useDataFilters, useTracker } from '@/app/UDIChatContext';
import type { DataSelection } from '@/features/dashboard';
import type { FilterDiagnosis, FieldSuggestion } from '@/features/data-package';
import type { PointSelection } from 'udi-toolkit/react';
import { FieldListChip } from './FieldListChip';
import { ValuePicker } from './ValuePicker';

/**
 * Only the verdicts that mean "this filter cannot be applied". `ok`,
 * `loading`, `unverifiable` and `empty-request` all render the genuine widget
 * instead, so listing them here would be dead code that quietly rots.
 */
type UnmatchedDiagnosis = Extract<
  FilterDiagnosis,
  { kind: 'unknown-entity' | 'unknown-field' | 'partial-match' | 'no-match' }
>;

interface UnmatchedFilterNoticeProps {
  diagnosis: UnmatchedDiagnosis;
  filterKey: string;
}

const q = (v: string) => `"${v}"`;

/**
 * Explains a filter the data can't satisfy, and offers a one-click fix.
 *
 * Before this, such a filter was dropped in `syncFiltersFromMessages` and the
 * chat rendered an empty bubble — the worst possible feedback, since the user
 * can't tell a hallucinated value from a broken app. The card names the miss,
 * points at any field that really does hold the value, and lists the field's
 * actual values as a picker so the repair is a click rather than a re-ask.
 */
export function UnmatchedFilterNotice({ diagnosis, filterKey }: UnmatchedFilterNoticeProps) {
  const setDataSelection = useDataFilters((s) => s.setDataSelection);
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const entityNames = useDataPackage((s) => s.entityNames);
  const trackEvent = useTracker();

  // Only values the field really has are pre-ticked. Carrying the invented one
  // through would smuggle it straight back into the repaired filter.
  const selected: readonly string[] = diagnosis.kind === 'partial-match' ? diagnosis.present : [];

  const commit = (selection: DataSelection, via: string) => {
    setDataSelection(filterKey, selection);
    trackEvent('filter_repair_applied', {
      kind: diagnosis.kind,
      via,
      entity: diagnosis.entity,
      field: 'field' in diagnosis ? diagnosis.field : '',
    });
  };

  const commitValues = (entity: string, field: string, values: string[], via: string) =>
    commit(
      { dataSourceKey: entity, type: 'point', selection: { [field]: values } as PointSelection },
      via,
    );

  const crossFieldHint = (suggestions: FieldSuggestion[], value: string) =>
    suggestions.length > 0 && (
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span>{q(value)} does appear in</span>
        {suggestions.map((s) => (
          <Badge
            key={`${s.entity}.${s.field}`}
            variant="outline"
            role="button"
            tabIndex={0}
            className="cursor-pointer font-mono text-[10px] hover:bg-muted hover:text-foreground"
            onClick={() => commitValues(s.entity, s.field, [s.value], 'cross-field')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                commitValues(s.entity, s.field, [s.value], 'cross-field');
              }
            }}
          >
            {s.sameEntity ? s.field : `${s.entity}.${s.field}`}
          </Badge>
        ))}
      </div>
    );

  const picker = (entity: string, field: string, options: string[]) => (
    <ValuePicker
      options={options}
      selected={selected}
      idPrefix={`${filterKey}-${field}`}
      onToggle={(value, checked) =>
        commitValues(
          entity,
          field,
          checked ? [...selected, value] : selected.filter((v) => v !== value),
          'pick',
        )
      }
    />
  );

  const body = () => {
    switch (diagnosis.kind) {
      case 'unknown-entity': {
        const { entity, nearbyEntities } = diagnosis;
        const shown = nearbyEntities.length > 0 ? nearbyEntities : entityNames;
        // No repair offered: rebuilding entity, field and value inside a card
        // is worse than re-asking, and there is no valid selection to commit.
        return (
          <>
            <p>
              This data has no {q(entity)} to filter. Try asking again about one of these instead:
            </p>
            <div className="flex flex-wrap gap-1">
              {shown.map((e) => (
                <Badge key={e} variant="secondary" className="font-mono text-[10px]">
                  {e}
                </Badge>
              ))}
            </div>
          </>
        );
      }

      case 'unknown-field': {
        const { entity, field, nearbyFields, otherFields } = diagnosis;
        const hasHints = nearbyFields.length > 0 || otherFields.length > 0;
        return (
          <>
            <p>
              <span className="font-mono">{entity}</span> has no field{' '}
              <span className="font-mono">{field}</span>.
            </p>
            {nearbyFields.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <span>Did you mean</span>
                {nearbyFields.map((f) => (
                  <Badge
                    key={f}
                    variant="outline"
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer font-mono text-[10px] hover:bg-muted hover:text-foreground"
                    onClick={() => commitValues(entity, f, [], 'field-suggestion')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        commitValues(entity, f, [], 'field-suggestion');
                      }
                    }}
                  >
                    {f}
                  </Badge>
                ))}
              </div>
            )}
            {otherFields.length > 0 && crossFieldHint(otherFields, otherFields[0].value)}
            {/* Nothing resembled the request — fall back to the whole field
                list, which already handles hundreds of fields with a search. */}
            {!hasHints && (
              <FieldListChip
                entity={entity}
                fields={sourceFields?.[entity] ?? []}
                onSelect={(f) => commitValues(entity, f, [], 'field-list')}
              />
            )}
          </>
        );
      }

      case 'partial-match':
      case 'no-match': {
        const { entity, field, missing, nearby, otherFields, options } = diagnosis;
        const present = diagnosis.kind === 'partial-match' ? diagnosis.present : [];
        // A single case-only near miss is safe to offer as one click. Never
        // auto-applied: the query matches exactly, so silently rewriting the
        // value would change what's shown without the user knowing.
        const caseFix = nearby.length === 1 && nearby[0].via === 'case' ? nearby[0] : null;
        return (
          <>
            <p>
              <span className="font-mono">
                {entity}.{field}
              </span>{' '}
              has no value {missing.map(q).join(', ')}.
              {present.length > 0 &&
                ` ${present.length} of ${present.length + missing.length} values matched.`}
            </p>

            {caseFix && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Did you mean {q(caseFix.value)}?</span>
                <Button
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => commitValues(entity, field, [caseFix.value], 'case')}
                >
                  Use it
                </Button>
              </div>
            )}

            {!caseFix && nearby.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <span>Nearby:</span>
                {nearby.map((n) => (
                  <Badge
                    key={n.value}
                    variant="outline"
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer text-[10px] hover:bg-muted hover:text-foreground"
                    onClick={() => commitValues(entity, field, [n.value], 'nearby')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        commitValues(entity, field, [n.value], 'nearby');
                      }
                    }}
                  >
                    {n.value}
                  </Badge>
                ))}
              </div>
            )}

            {otherFields.length > 0 && crossFieldHint(otherFields, missing[0])}

            {present.length > 0 && (
              <Button
                size="sm"
                className="h-6 text-xs"
                onClick={() => commitValues(entity, field, present, 'partial')}
              >
                Apply the {present.length} matching {present.length === 1 ? 'value' : 'values'}
              </Button>
            )}

            <div className="space-y-1.5 border-t pt-2">
              <span className="text-xs text-muted-foreground">
                Pick from the {options.length} {options.length === 1 ? 'value' : 'values'}{' '}
                <span className="font-mono">{field}</span> does have:
              </span>
              {picker(entity, field, options)}
            </div>
          </>
        );
      }

      // The prop type admits nothing else.
      default:
        return null;
    }
  };

  return (
    <div className="my-2 space-y-2 rounded border bg-background/50 p-2">
      <div className="flex items-center gap-1.5 text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[10px] font-medium tracking-wider uppercase">No matching values</span>
      </div>
      <div className="space-y-2 text-sm">{body()}</div>
    </div>
  );
}
