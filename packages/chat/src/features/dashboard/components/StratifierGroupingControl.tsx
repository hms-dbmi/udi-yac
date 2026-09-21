import { useCallback, useMemo, useRef, useState } from 'react';
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
  cutPrecision,
  equalWidthCuts,
  groupingLabels,
  moveCut,
  nextGroupLabel,
  parseGrouping,
  removeCut,
  renameGroup,
  serializeGrouping,
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

  // What Reset goes back to. A lazy initializer captures the grouping this
  // control first mounted with and never recomputes it — deliberately not
  // refreshed by the adoption branch above, which is for a rebind somewhere
  // else: Reset should still mean "the split this chart started with" after
  // any number of Applies. A chart created ungrouped captures null, so Reset
  // there still clears, exactly as before.
  const [original] = useState<Grouping | null>(() => parseGrouping(param.value));

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

  // A trigger-anchored popover lands on whatever the reader is looking at, and
  // the tweak row renders in two places that need opposite answers.
  //
  // On a dashboard card it goes to the *left of the card*: covering a
  // neighbouring card is fine, and there is always room that way because the
  // chat column is there. In a chat bubble the trigger is indented inside the
  // bubble, so 320px starting at it spills over the dashboard — there it keeps
  // the trigger's vertical position but takes its left edge from the chat
  // column, which is what puts it fully inside the chat.
  //
  // Both hosts are found with one `closest()` from the trigger: the card is the
  // nearer ancestor on the dashboard, and the column is the only match in the
  // chat. Resolved on open rather than passed down, so neither site needs to
  // know which one it is.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [host, setHost] = useState<{ el: Element; onCard: boolean } | null>(null);

  const anchor = !host
    ? undefined
    : host.onCard
      ? host.el
      : {
          getBoundingClientRect: (): DOMRect => {
            const column = host.el.getBoundingClientRect();
            const trigger = triggerRef.current?.getBoundingClientRect();
            if (!trigger) return column;
            // The column's horizontal placement, the trigger's vertical one.
            return {
              x: column.left,
              y: trigger.top,
              left: column.left,
              right: column.left + column.width,
              top: trigger.top,
              bottom: trigger.top + trigger.height,
              width: column.width,
              height: trigger.height,
            } as DOMRect;
          },
        };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const el = triggerRef.current?.closest('[data-udi-viz-card], [data-udi-chat-column]');
          setHost(el ? { el, onCard: el.hasAttribute('data-udi-viz-card') } : null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        ref={triggerRef}
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="udi:h-7 udi:w-auto udi:text-xs udi:font-normal"
          />
        }
      >
        <span className="udi:text-muted-foreground udi:mr-1">{param.label}:</span>
        {summarize(draft, param.stratifier)}
      </PopoverTrigger>
      <PopoverContent
        className="udi:w-80"
        align="start"
        side={host?.onCard ? 'left' : 'bottom'}
        anchor={anchor}
      >
        <div className="udi:flex udi:flex-col udi:gap-3">
          <div>
            <p className="udi:text-xs udi:font-medium">Group {param.stratifier}</p>
            <p className="udi:text-[11px] udi:text-muted-foreground">
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
            <p role="status" className="udi:text-[11px] udi:text-destructive">
              {labels.length} groups — at most {MAX_GROUPS} can be told apart on one chart.
            </p>
          )}

          <div className="udi:flex udi:items-center udi:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="udi:h-7 udi:text-xs"
              disabled={disabled || serializeGrouping(draft) === serializeGrouping(original)}
              onClick={() => apply(original)}
            >
              Reset
            </Button>
            <Button
              size="sm"
              className="udi:h-7 udi:text-xs"
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
      <p className="udi:text-[11px] udi:text-muted-foreground">
        The values of this field are not loaded, so there is nothing to group by yet.
      </p>
    );
  }

  return (
    <div className="udi:flex udi:flex-col udi:gap-2">
      {grouping.groups.map((group, index) => (
        <div key={index} className="udi:rounded udi:border udi:p-2">
          <div className="udi:flex udi:items-center udi:gap-1">
            <Input
              value={group.label}
              disabled={disabled}
              aria-label={`Group ${index + 1} name`}
              className="udi:h-6 udi:text-xs"
              onChange={(e) => onDraft(renameGroup(grouping, index, e.target.value))}
            />
            <Button
              variant="ghost"
              size="icon"
              className="udi:h-6 udi:w-6 udi:shrink-0"
              aria-label={`Remove ${group.label}`}
              disabled={disabled}
              onClick={() =>
                onApply({
                  ...grouping,
                  groups: grouping.groups.filter((_, i) => i !== index),
                })
              }
            >
              <X className="udi:h-3 udi:w-3" />
            </Button>
          </div>
          <div className="udi:mt-1 udi:flex udi:flex-wrap udi:gap-1">
            {group.values.map((value) => (
              <button
                key={value}
                type="button"
                disabled={disabled}
                className="udi:rounded udi:bg-secondary udi:px-1.5 udi:py-0.5 udi:text-[10px] udi:hover:line-through"
                title="Remove from this group"
                onClick={() => onApply(assignValue(grouping, value, null))}
              >
                {value}
              </button>
            ))}
            {group.values.length === 0 && (
              <span className="udi:text-[10px] udi:text-muted-foreground">no values yet</span>
            )}
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="udi:h-7 udi:text-xs"
        disabled={disabled || grouping.groups.length >= MAX_GROUPS}
        onClick={() =>
          onDraft({
            ...grouping,
            groups: [...grouping.groups, { label: nextGroupLabel(grouping), values: [] }],
          })
        }
      >
        <Plus className="udi:mr-1 udi:h-3 udi:w-3" /> Add group
      </Button>

      {grouping.groups.length > 0 && (
        <div>
          <p className="udi:mb-1 udi:text-[11px] udi:text-muted-foreground">
            Unassigned ({unassigned.length}) — click to file into a group
          </p>
          <div className="udi:flex udi:max-h-28 udi:flex-wrap udi:gap-1 udi:overflow-y-auto">
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
      <div className="udi:flex udi:items-center udi:gap-2">
        <span className="udi:text-[11px] udi:text-muted-foreground">Unassigned values</span>
        <Select
          value={grouping.other === null ? '__drop__' : '__other__'}
          disabled={disabled}
          onValueChange={(v) =>
            onApply({ ...grouping, other: v === '__drop__' ? null : DEFAULT_OTHER_LABEL })
          }
        >
          <SelectTrigger className="udi:h-6 udi:flex-1 udi:text-xs">
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
          className="udi:h-6 udi:text-xs"
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
        className="udi:rounded udi:border udi:px-1.5 udi:py-0.5 udi:text-[10px] udi:hover:bg-accent"
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
        className="udi:h-5 udi:w-auto udi:border udi:px-1.5 udi:text-[10px]"
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

  const precision = cutPrecision(min, max);

  const setCuts = useCallback(
    (next: number[], commit: boolean) => {
      const grouping: QuantitativeGrouping = { type: 'quantitative', cuts: next };
      if (commit) onApply(grouping);
      else onDraft(grouping);
    },
    [onApply, onDraft],
  );

  return (
    <div className="udi:flex udi:flex-col udi:gap-2">
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
      <div className="udi:flex udi:flex-col udi:gap-1">
        {cuts.map((cut, index) => (
          <div key={index} className="udi:flex udi:items-center udi:gap-1">
            <span className="udi:w-10 udi:shrink-0 udi:text-[10px] udi:text-muted-foreground">
              cut {index + 1}
            </span>
            <CutInput
              value={cut}
              precision={precision}
              disabled={disabled}
              label={`Cut point ${index + 1}`}
              onCommit={(value) => setCuts(moveCut(cuts, index, value, precision), true)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="udi:h-6 udi:w-6 udi:shrink-0"
              aria-label={`Remove cut point ${index + 1}`}
              disabled={disabled}
              onClick={() => setCuts(removeCut(cuts, index), true)}
            >
              <X className="udi:h-3 udi:w-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="udi:flex udi:gap-1">
        <Button
          variant="outline"
          size="sm"
          className="udi:h-7 udi:flex-1 udi:text-xs"
          disabled={disabled || cuts.length + 1 >= MAX_GROUPS}
          onClick={() => setCuts(addCut(cuts, (min + max) / 2, precision), true)}
        >
          <Plus className="udi:mr-1 udi:h-3 udi:w-3" /> Add cut
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="udi:h-7 udi:flex-1 udi:text-xs"
          disabled={disabled}
          onClick={() => setCuts(equalWidthCuts(min, max, 2, precision), true)}
          title="Split the range in half"
        >
          Halve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="udi:h-7 udi:flex-1 udi:text-xs"
          disabled={disabled}
          onClick={() => setCuts(equalWidthCuts(min, max, 4, precision), true)}
          title="Four equally wide buckets"
        >
          Quarters
        </Button>
      </div>

      <p className="udi:text-[10px] udi:text-muted-foreground">
        {cuts.length === 0
          ? 'No thresholds yet — a numeric stratifier needs at least one.'
          : groupingLabels({ type: 'quantitative', cuts }).join(' · ')}
      </p>
    </div>
  );
}

/**
 * One cut point as a number you can type into.
 *
 * The text is held locally and only reported when the edit is finished, because
 * the cut list is kept sorted: reporting each keystroke meant that typing `1000`
 * into the upper of two cuts sent `1` through `moveCut` first, which re-sorted
 * the list and moved a *different* cut under the caret. The field then showed
 * its neighbour's value and the rest of the edit landed on the wrong cut.
 *
 * Re-syncing from the prop only while unfocused is what makes that safe: a
 * commit that reorders the list updates every other field, and leaves the one
 * being typed in alone.
 */
function CutInput({
  value,
  precision,
  disabled,
  label,
  onCommit,
}: {
  value: number;
  precision: number;
  disabled: boolean;
  label: string;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(() => String(value));
  // "The user has typed something here that they have not finished", NOT "this
  // field has focus". Base UI moves focus into the popup when it opens, and
  // this is the first focusable thing in it — so gating on focus meant the
  // field was considered mid-edit from the moment the popover opened, and a
  // cut dragged on the histogram never reached the box beside it.
  const [dirty, setDirty] = useState(false);
  const [syncedTo, setSyncedTo] = useState(value);
  if (!dirty && syncedTo !== value) {
    setSyncedTo(value);
    setText(String(value));
  }
  // Escape blurs the field, and the blur that follows must not commit what
  // Escape just discarded. A ref rather than state because the blur handler
  // runs before a state update from the keydown would reach it.
  const cancelled = useRef(false);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || !isFinite(parsed)) {
      setText(String(value)); // unparseable: keep the cut where it was
      return;
    }
    // Tabbing through an untouched field should not re-bind the chart.
    if (Number(parsed.toFixed(precision)) === value) {
      setText(String(value));
      return;
    }
    onCommit(parsed);
  };

  return (
    <Input
      type="number"
      // Arrow keys and the spinner should move by the smallest step the field is
      // worth reading at, not always by 1.
      step={10 ** -precision}
      value={text}
      disabled={disabled}
      aria-label={label}
      className="udi:h-6 udi:text-xs"
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        // Typing is an unfinished thought and waits for Enter or blur; a step
        // is a finished one and applies at once. Every browser reports a text
        // edit with an `inputType` ("insertText", "deleteContentBackward", …)
        // and reports a value change that was not a text edit — the spinner
        // buttons and the arrow keys, which the input steps natively — with
        // none, which is what tells the two apart.
        if ((e.nativeEvent as Partial<InputEvent>).inputType) {
          setDirty(true);
          return;
        }
        setDirty(false);
        commit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          cancelled.current = true;
          setDirty(false);
          setText(String(value));
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        setDirty(false);
        if (cancelled.current) {
          cancelled.current = false;
          setText(String(value));
          return;
        }
        commit(text);
      }}
    />
  );
}
