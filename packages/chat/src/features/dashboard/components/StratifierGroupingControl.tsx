import { useCallback, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useQueryData, type QueryDataSpec } from 'udi-toolkit/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDataPackage } from '@/app/UDIChatContext';
import type { CategoricalDomain, IntervalDomain } from '@/types/dataPackage';
import { joinDataPath } from '@/features/data-package';
import type { TemplateArgValue } from '@/types/messages';
import type { GroupingTweakableParam } from './VizTweakComponent.types';
import { CutPointHistogram } from './CutPointHistogram';
import {
  DEFAULT_OTHER_LABEL,
  MAX_GROUPS,
  addCut,
  assignValue,
  equalWidthCuts,
  groupingLabels,
  moveCut,
  nextGroupLabel,
  parseGrouping,
  removeCut,
  renameGroup,
  unassignedValues,
  type Grouping,
  type NominalGrouping,
  type QuantitativeGrouping,
} from '../utils/grouping';

interface StratifierGroupingControlProps {
  param: GroupingTweakableParam;
  /**
   * Applies the grouping by re-resolving the template. Takes the grouping
   * object, or '' for ungrouped — the same shape the agent binds, so nothing
   * serializes and reparses it on the way through.
   */
  onApply: (grouping: TemplateArgValue) => void;
  disabled?: boolean;
}

/** Bins for the distribution strip. Enough shape to site a cut, cheap to compute. */
const HISTOGRAM_BINS = 24;

/**
 * The control that re-cuts a chart's strata.
 *
 * Two editors behind one popover, because the two field types need genuinely
 * different gestures: a nominal stratifier is a list of values to combine, a
 * quantitative one is a distribution to cut. What they share is the contract —
 * edit locally, and only send the finished grouping to the agent — so a
 * half-typed group name never becomes a re-bind.
 */
export function StratifierGroupingControl({
  param,
  onApply,
  disabled = false,
}: StratifierGroupingControlProps) {
  const [open, setOpen] = useState(false);
  const stored = useMemo(() => parseGrouping(param.value), [param.value]);
  // Local until applied. A re-bind replaces the whole spec, so firing one per
  // keystroke would rebuild the chart while the user is still naming a group.
  const [draft, setDraft] = useState<Grouping | null>(stored);
  const [draftKey, setDraftKey] = useState(param.value);
  if (draftKey !== param.value) {
    // The agent accepted a different grouping than the one being edited (a
    // rebind elsewhere, or a restored conversation). Adopt it rather than
    // keeping a draft that no longer describes the chart.
    setDraftKey(param.value);
    setDraft(stored);
  }

  const domains = useDataPackage((s) => s.dataFieldDomains);
  const domain = useMemo(
    () => domains.find((d) => d.entity === param.entity && d.field === param.stratifier),
    [domains, param.entity, param.stratifier],
  );

  const isQuantitative =
    param.stratifierType === 'quantitative' ||
    (!param.stratifierType && domain?.type === 'interval');

  const labels = groupingLabels(draft);
  const tooMany = labels.length > MAX_GROUPS;

  const apply = useCallback(
    (grouping: Grouping | null) => {
      setDraft(grouping);
      onApply(grouping ?? '');
    },
    [onApply],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-7 w-auto text-xs font-normal"
          />
        }
      >
        <span className="text-muted-foreground mr-1">{param.label}:</span>
        {summarize(draft, param.stratifier)}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium">Group {param.stratifier}</p>
            <p className="text-[11px] text-muted-foreground">
              {isQuantitative
                ? 'Click the distribution to add a threshold, or drag one to move it.'
                : 'Combine values into named groups; the rest fall into Other.'}
            </p>
          </div>

          {isQuantitative ? (
            <QuantitativeEditor
              param={param}
              draft={draft as QuantitativeGrouping | null}
              domain={domain?.type === 'interval' ? (domain.domain as IntervalDomain) : null}
              onDraft={setDraft}
              onApply={apply}
              disabled={disabled}
            />
          ) : (
            <NominalEditor
              draft={draft as NominalGrouping | null}
              values={domain?.type === 'point' ? (domain.domain as CategoricalDomain).values : []}
              onDraft={setDraft}
              onApply={apply}
              disabled={disabled}
            />
          )}

          {tooMany && (
            <p role="status" className="text-[11px] text-destructive">
              {labels.length} groups — at most {MAX_GROUPS} can be told apart on one chart.
            </p>
          )}

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={disabled || !draft}
              onClick={() => apply(null)}
            >
              Reset
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={disabled || tooMany}
              onClick={() => {
                apply(draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function summarize(grouping: Grouping | null, stratifier: string): string {
  if (!grouping) return `each ${stratifier || 'value'}`;
  const count = groupingLabels(grouping).length;
  return `${count} group${count === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Nominal: named groups, with everything unclaimed pooled into Other
// ---------------------------------------------------------------------------

function emptyNominal(): NominalGrouping {
  return { type: 'nominal', groups: [], other: DEFAULT_OTHER_LABEL };
}

function NominalEditor({
  draft,
  values,
  onDraft,
  onApply,
  disabled,
}: {
  draft: NominalGrouping | null;
  values: string[];
  onDraft: (g: Grouping) => void;
  onApply: (g: Grouping) => void;
  disabled: boolean;
}) {
  const grouping = draft && draft.type === 'nominal' ? draft : emptyNominal();
  const unassigned = unassignedValues(grouping, values);

  if (values.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        The values of this field are not loaded, so there is nothing to group by yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {grouping.groups.map((group, index) => (
        <div key={index} className="rounded border p-2">
          <div className="flex items-center gap-1">
            <Input
              value={group.label}
              disabled={disabled}
              aria-label={`Group ${index + 1} name`}
              className="h-6 text-xs"
              onChange={(e) => onDraft(renameGroup(grouping, index, e.target.value))}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label={`Remove ${group.label}`}
              disabled={disabled}
              onClick={() =>
                onApply({
                  ...grouping,
                  groups: grouping.groups.filter((_, i) => i !== index),
                })
              }
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {group.values.map((value) => (
              <button
                key={value}
                type="button"
                disabled={disabled}
                className="rounded bg-secondary px-1.5 py-0.5 text-[10px] hover:line-through"
                title="Remove from this group"
                onClick={() => onApply(assignValue(grouping, value, null))}
              >
                {value}
              </button>
            ))}
            {group.values.length === 0 && (
              <span className="text-[10px] text-muted-foreground">no values yet</span>
            )}
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={disabled || grouping.groups.length >= MAX_GROUPS}
        onClick={() =>
          onDraft({
            ...grouping,
            groups: [...grouping.groups, { label: nextGroupLabel(grouping), values: [] }],
          })
        }
      >
        <Plus className="mr-1 h-3 w-3" /> Add group
      </Button>

      {grouping.groups.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">
            Unassigned ({unassigned.length}) — click to file into a group
          </p>
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {unassigned.map((value) => (
              <UnassignedValue
                key={value}
                value={value}
                groups={grouping.groups.map((g) => g.label)}
                disabled={disabled}
                onAssign={(label) => onApply(assignValue(grouping, value, label))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Where the leftovers go. A single curve labelled "Other" is usually
          right; dropping them is the honest alternative when they are a
          grab-bag that would only add noise. */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Unassigned values</span>
        <Select
          value={grouping.other === null ? '__drop__' : '__other__'}
          disabled={disabled}
          onValueChange={(v) =>
            onApply({ ...grouping, other: v === '__drop__' ? null : DEFAULT_OTHER_LABEL })
          }
        >
          <SelectTrigger className="h-6 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__other__">shown as “{DEFAULT_OTHER_LABEL}”</SelectItem>
            <SelectItem value="__drop__">left out of the chart</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {grouping.other !== null && (
        <Input
          value={grouping.other}
          disabled={disabled}
          aria-label="Other group name"
          className="h-6 text-xs"
          onChange={(e) => onDraft({ ...grouping, other: e.target.value })}
        />
      )}
    </div>
  );
}

function UnassignedValue({
  value,
  groups,
  disabled,
  onAssign,
}: {
  value: string;
  groups: string[];
  disabled: boolean;
  onAssign: (label: string) => void;
}) {
  // One group is the overwhelmingly common case ("this versus everything
  // else"), and a menu to pick from one option is a worse click than none.
  if (groups.length === 1) {
    return (
      <button
        type="button"
        disabled={disabled}
        className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent"
        onClick={() => onAssign(groups[0])}
      >
        {value}
      </button>
    );
  }
  return (
    <Select
      disabled={disabled}
      value=""
      onValueChange={(label) => {
        if (label) onAssign(label);
      }}
    >
      <SelectTrigger
        className="h-5 w-auto border px-1.5 text-[10px]"
        aria-label={`Assign ${value}`}
      >
        {value}
      </SelectTrigger>
      <SelectContent>
        {groups.map((label) => (
          <SelectItem key={label} value={label}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Quantitative: cut points over the field's distribution
// ---------------------------------------------------------------------------

function QuantitativeEditor({
  param,
  draft,
  domain,
  onDraft,
  onApply,
  disabled,
}: {
  param: GroupingTweakableParam;
  draft: QuantitativeGrouping | null;
  domain: IntervalDomain | null;
  onDraft: (g: Grouping) => void;
  onApply: (g: Grouping) => void;
  disabled: boolean;
}) {
  const cuts = draft?.type === 'quantitative' ? draft.cuts : [];
  const dataPackage = useDataPackage((s) => s.dataPackage);

  // The distribution behind the handles. The field's domain carries only min
  // and max, so the shape has to be queried — through the same toolkit path
  // every other chart uses, which means it works against a server-backed
  // package as well as the browser's own tables.
  const spec = useMemo<QueryDataSpec | null>(() => {
    if (!param.entity || !param.stratifier || !dataPackage) return null;
    const resource = dataPackage.resources?.find((r) => r.name === param.entity);
    if (!resource) return null;
    return {
      source: {
        name: param.entity,
        source: joinDataPath(dataPackage['udi:path'] ?? '', resource.path),
      },
      transformation: [
        {
          binby: {
            field: param.stratifier,
            bins: HISTOGRAM_BINS,
            output: { bin_start: 'bin_start', bin_end: 'bin_end' },
          },
        },
        { rollup: { count: { op: 'count' } } },
      ],
    } as QueryDataSpec;
  }, [dataPackage, param.entity, param.stratifier]);

  const { displayData } = useQueryData(spec ?? { source: { name: '', source: '' } }, {
    enabled: spec !== null,
  });

  const { bins, min, max } = useMemo(() => {
    const rows = (displayData ?? []) as Array<Record<string, unknown>>;
    const usable = rows
      .filter((r) => typeof r.bin_start === 'number' && typeof r.count === 'number')
      .sort((a, b) => (a.bin_start as number) - (b.bin_start as number));
    if (usable.length === 0) {
      return { bins: [] as number[], min: domain?.min ?? 0, max: domain?.max ?? 1 };
    }
    return {
      bins: usable.map((r) => r.count as number),
      min: domain?.min ?? (usable[0].bin_start as number),
      max: domain?.max ?? (usable[usable.length - 1].bin_end as number),
    };
  }, [displayData, domain]);

  const setCuts = useCallback(
    (next: number[], commit: boolean) => {
      const grouping: QuantitativeGrouping = { type: 'quantitative', cuts: next };
      if (commit) onApply(grouping);
      else onDraft(grouping);
    },
    [onApply, onDraft],
  );

  return (
    <div className="flex flex-col gap-2">
      <CutPointHistogram
        bins={bins}
        min={min}
        max={max}
        cuts={cuts}
        disabled={disabled}
        onChange={(next) => setCuts(next, false)}
        onCommit={(next) => setCuts(next, true)}
      />

      {/* The same cut points as numbers. Dragging is for finding a threshold;
          typing is for the one a protocol already fixed at exactly 65. */}
      <div className="flex flex-col gap-1">
        {cuts.map((cut, index) => (
          <div key={index} className="flex items-center gap-1">
            <span className="w-10 shrink-0 text-[10px] text-muted-foreground">cut {index + 1}</span>
            <Input
              type="number"
              value={cut}
              disabled={disabled}
              aria-label={`Cut point ${index + 1}`}
              className="h-6 text-xs"
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isNaN(value)) return;
                setCuts(moveCut(cuts, index, value), false);
              }}
              onBlur={() =>
                setCuts(
                  [...cuts].sort((a, b) => a - b),
                  true,
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label={`Remove cut point ${index + 1}`}
              disabled={disabled}
              onClick={() => setCuts(removeCut(cuts, index), true)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 text-xs"
          disabled={disabled || cuts.length + 1 >= MAX_GROUPS}
          onClick={() => setCuts(addCut(cuts, (min + max) / 2), true)}
        >
          <Plus className="mr-1 h-3 w-3" /> Add cut
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 text-xs"
          disabled={disabled}
          onClick={() => setCuts(equalWidthCuts(min, max, 2), true)}
          title="Split the range in half"
        >
          Halve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 text-xs"
          disabled={disabled}
          onClick={() => setCuts(equalWidthCuts(min, max, 4), true)}
          title="Four equally wide buckets"
        >
          Quarters
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {cuts.length === 0
          ? 'No thresholds yet — a numeric stratifier needs at least one.'
          : groupingLabels({ type: 'quantitative', cuts }).join(' · ')}
      </p>
    </div>
  );
}
