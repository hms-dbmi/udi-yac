<script setup lang="ts">
import {
  computed,
  markRaw,
  ref,
  shallowRef,
  onMounted,
  onBeforeUnmount,
} from 'vue';
import vegaEmbed from 'vega-embed';
// `defineProps` is a compile-time macro in <script setup> — importing it
// shadows the macro and trips TS 6's "Import declaration conflicts with
// local declaration" diagnostic. The macro is in scope automatically.
import { watch } from 'vue';
import type {
  ActiveDataSelection,
  DataSelections,
  RangeSelection,
} from './DataSourcesStore';
import { useDataSourcesStore } from './DataSourcesStore';
import { getQueryBackend } from './queryBackend';
import type { View } from 'vega';
import type { VisualizationSpec } from 'vega-embed';
import { changeset } from 'vega';
const dataSourcesStore = useDataSourcesStore();
import { isEmpty, debounce } from 'lodash';
import type { UDIPalette } from './Palette';
import { DEFAULT_PALETTE, toVegaRange, toVegaRamp } from './Palette';
import { registerRampScheme } from './paletteScheme';
import {
  PICK_SIGNAL,
  type PickMode,
  fieldChannel,
  holdsPickMode,
  keyPickMode,
  pickModeOf,
  rangePicks,
  selectFields,
  togglePointValues,
} from './pointSelect';
import {
  CLICKABLE_LABELS,
  CLICKABLE_LEGEND,
  CLICKABLE_LEGEND_SYMBOLS,
  LABEL_TOTALS_SIGNAL,
  LEGEND_TOTALS_SIGNAL,
  type LabelAxis,
  categoryTotals,
  findLabelAxis,
  findLabelLegend,
  patchLabelAxis,
  patchLabelLegend,
  underlineGeometry,
} from './axisLabelSelect';

// our type is more specific than the one from vega-embed
interface VegaSpecShim {
  data: {
    values?: object[];
  };
}

// Shape callers actually hand us — a UDI grammar `DataSelection` for a
// point selection. `fields` is optional in that grammar; the click
// handler treats "no fields" as a no-op rather than throwing.
interface PointSelect {
  name: string;
  fields?: string[] | string;
}

interface VegaLiteProps {
  spec: string;
  // All optional props use `?: T | undefined` (rather than the cleaner
  // `?: T`) so callers under `exactOptionalPropertyTypes: true` — the
  // Quasar dev typecheck has this enabled — can pass an explicit
  // `undefined` (e.g. `:hide-actions="props.spec.config?.hideActions"`)
  // without the compiler complaining. Vue treats both forms the same at
  // runtime; this is purely a TS-encoding compatibility detail.
  hideActions?: boolean | undefined;
  signalKeys?: string[] | undefined;
  signalFieldMap?: Record<string, Record<string, string>> | undefined;
  pointSelect?: PointSelect | null | undefined;
  selections?: DataSelections | null | undefined;
  /** Consumer-supplied color palette; falls back to DEFAULT_PALETTE per channel. */
  palette?: UDIPalette | undefined;
}

const props = defineProps<VegaLiteProps>();

// Build the vega-embed `config` object from the palette prop, falling back to
// DEFAULT_PALETTE per channel. A spec-level per-encoding `range` still wins —
// this only sets the scale defaults.
function buildVegaConfig(): Record<string, unknown> {
  const palette = props.palette ?? {};
  const markColor = palette.mark ?? DEFAULT_PALETTE.mark;
  const category = palette.category ?? DEFAULT_PALETTE.category;
  const ordinal = palette.ordinal ?? DEFAULT_PALETTE.ordinal;
  const ramp = palette.ramp ?? DEFAULT_PALETTE.ramp;

  const range: Record<string, unknown> = {};
  if (category != null) range.category = toVegaRange(category);
  if (ordinal != null) range.ordinal = toVegaRange(ordinal);
  if (ramp != null) range.ramp = toVegaRamp(ramp, registerRampScheme);

  // Chrome. Vega's defaults are a white plot with black axes, which reads as a
  // bright rectangle punched into a dark host app; none of it is reachable from
  // a spec, so the palette is the only place it can come from.
  const background = palette.background ?? DEFAULT_PALETTE.background;
  const axis = palette.axis ?? DEFAULT_PALETTE.axis;
  const grid = palette.grid ?? DEFAULT_PALETTE.grid;
  const text = palette.text ?? DEFAULT_PALETTE.text;

  const config: Record<string, unknown> = {
    point: { shape: 'circle', filled: true },
    range,
    background,
    axis: {
      domainColor: axis,
      tickColor: axis,
      gridColor: grid,
      labelColor: text,
      titleColor: text,
    },
    // The plot frame Vega strokes behind the marks — a rule, not an axis.
    view: { stroke: grid },
    legend: { labelColor: text, titleColor: text },
    title: { color: text, subtitleColor: text },
  };
  if (markColor != null) config.mark = { color: markColor };
  return config;
}

// What the chart can do, surfaced on hover: a pill naming the gesture, and for
// point selections a pointer and a highlight on the hovered mark (CSS below).
// A brush's crosshair is set in the spec (UDIVis), since Vega owns the cursor
// there and the brush rect needs its own.
const pointSelectable = computed(
  () => selectFields(props.pointSelect?.fields).length > 0,
);
const toggleKey =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? '⌘'
    : 'Ctrl';
const hint = computed(() =>
  props.signalKeys?.length
    ? 'Drag to filter'
    : pointSelectable.value
      ? `Click to filter · Shift range · ${toggleKey} toggle`
      : null,
);
// The pill takes the palette's colors. A transparent background (the default,
// which inherits the card) would leave its text over the marks, so the CSS
// falls back to the page's own `Canvas` then.
const hintColors = computed(() => {
  const palette = props.palette ?? {};
  const background = palette.background ?? DEFAULT_PALETTE.background;
  return {
    '--udi-hint-fg': palette.text ?? DEFAULT_PALETTE.text,
    '--udi-hint-border': palette.grid ?? DEFAULT_PALETTE.grid,
    ...(background && background !== 'transparent'
      ? { '--udi-hint-bg': background }
      : {}),
  };
});

const vegaContainer = ref();
// `shallowRef`, not `ref`, and the view is marked raw on the way in.
//
// A plain `ref` makes its value DEEPLY reactive: Vue wraps the Vega View in a
// Proxy, and every object reached through it — datasets, tuples, scenegraph
// items — gets wrapped too. Vega's dataflow is built on object identity: tuples
// carry ids, marks join items to the tuples that produced them, and removals are
// matched by identity. Hand it proxies and those comparisons stop matching, so a
// removal fails to find the item it should delete and the mark keeps drawing it.
//
// That is hms-dbmi/udi-yac#34: the dataset ends up correct while the scenegraph
// holds one stale item per facet group, from the first shrink onwards, and only
// a re-embed clears it — because a re-embed builds a new view and new marks.
// Nothing in the component needs the view to be reactive; it is only ever used
// imperatively.
const vegaView = shallowRef<View | null>(null);

const errorMessage = ref();

function parseSpec(): { success: boolean; specObject?: VegaSpecShim } {
  let specObject = null;
  try {
    specObject = JSON.parse(props.spec);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error parsing spec', error);
      errorMessage.value = 'Error parsing spec: ' + error.message;
    } else {
      console.error('Error parsing spec: Non-error value', error);
      errorMessage.value = 'Error parsing spec: Unknown error';
    }
    // clear the container so the chart doesn't show up
    vegaContainer.value.innerHTML = '';
    return { success: false, specObject };
  }
  return { success: true, specObject };
}

const ignore = ref(false);

function formatVegaSignalKey(raw: string): string {
  // replace "-" with "_" in signalKey since Vega signals cannot contain "-"
  // TODO: I think if the key starts with a number they prepend an underscore
  return raw.replace(/-/g, '_');
}

//: The spec the running view was compiled from, with `data.values` stripped.
//
// Everything except the rows — scale domains, encodings, mark config, layer
// list — is baked in when the view is compiled, and a data changeset cannot
// change any of it. So a build whose spec differs structurally needs a fresh
// embed; applying only its data would leave the chart drawing new rows through
// the old spec, which is the "stale until I toggle table view and back" class of
// bug (toggling unmounts the view, forcing the re-embed by accident).
let embeddedSpecShape: string | null = null;

/** The part of a spec a changeset cannot update. */
function specShape(specObject: VegaSpecShim): string {
  const { data, ...rest } = specObject as Record<string, unknown> & {
    data?: { values?: unknown };
  };
  const dataWithoutRows = { ...(data ?? {}) };
  delete dataWithoutRows.values;
  return JSON.stringify({ ...rest, data: dataWithoutRows });
}

function initVegaChart() {
  // console.log('UDI-VIS: initialized chart');
  // console.log('init vega chart');
  const { success, specObject } = parseSpec();
  if (!success || !specObject) return;

  // Capture whether the spec opted into container sizing on each axis; the
  // ResizeObserver only re-embeds on resize when one of these is true.
  const specMaybeSized = specObject as { width?: unknown; height?: unknown };
  widthIsContainer = specMaybeSized.width === 'container';
  heightIsContainer = specMaybeSized.height === 'container';

  embeddedSpecShape = specShape(specObject);
  if (specObject.data && specObject.data.values) {
    delete specObject.data.values;
  }
  // A bar chart's category labels, and any chart's color legend, gray out when
  // a filter empties a category, and are clickable when the point selection
  // covers their field: the way to pick a bar too thin to hit, or every
  // segment of one color.
  const pointFields = selectFields(props.pointSelect?.fields);
  const axis = findLabelAxis(specObject, pointFields);
  const legend = findLabelLegend(specObject, pointFields);
  labelAxis = axis;
  labelLegend = legend;
  // console.log('initializing vega chart with spec:', specObject);
  vegaEmbed(vegaContainer.value, specObject as VisualizationSpec, {
    actions: props.hideActions ? false : true,
    config: buildVegaConfig(),
    ...(axis || legend
      ? {
          patch: (vgSpec) => {
            if (axis) patchLabelAxis(vgSpec, axis);
            if (legend) patchLabelLegend(vgSpec, legend);
            return vgSpec;
          },
        }
      : {}),
  })
    .then((result) => {
      errorMessage.value = null;
      const view = result.view;
      vegaView.value = markRaw(view);
      for (const signalKey of props.signalKeys ?? []) {
        const signalKeyFormatted = formatVegaSignalKey(signalKey);
        // Vega-Lite stores per-channel ranges in separate signals
        // ({name}_x, {name}_y). Read _tuple_fields to discover which
        // channels exist, then listen on each and combine into a
        // single multi-field selection update.
        const tupleFieldsKey = signalKeyFormatted + '_tuple_fields';
        const tupleFields = view.signal(tupleFieldsKey) as
          Array<{ channel: string; field: string }> | undefined;
        const channels = (tupleFields ?? []).map((t) => t.channel);
        const fieldMap = props.signalFieldMap?.[signalKey];

        const buildCombinedSelection = (): RangeSelection | null => {
          const combined: RangeSelection = {};
          for (const tf of tupleFields ?? []) {
            const channelSignal = `${signalKeyFormatted}_${tf.channel}`;
            const pixelRange = view.signal(channelSignal) as
              [number, number] | undefined;
            if (pixelRange == null) continue;
            const dataRange = fromPixelRange(
              pixelRange,
              tf.channel as 'x' | 'y',
            );
            // Skip degenerate ranges (single-point click before drag starts)
            if (Math.abs(dataRange[1] - dataRange[0]) < 1e-9) continue;
            const dataField = fieldMap?.[tf.field] ?? tf.field;
            combined[dataField] = dataRange;
          }
          return Object.keys(combined).length > 0 ? combined : null;
        };

        // Fire updates directly on each signal change so cross-chart
        // filtering stays live during drag. updateDataSelection already
        // short-circuits on equal selections via isEqual, and the
        // ignore flag prevents feedback loops during spec re-renders.
        if (channels.length > 0) {
          // Listen on each per-channel signal and combine all channels
          for (const channel of channels) {
            const channelSignal = `${signalKeyFormatted}_${channel}`;
            view.addSignalListener(channelSignal, () => {
              if (ignore.value) return;
              routeSelectionUpdate(signalKey, buildCombinedSelection());
            });
          }
        } else {
          // Fallback: listen on the main signal (1D selections or legacy)
          view.addSignalListener(signalKeyFormatted, (name, value) => {
            if (ignore.value) return;
            if (fieldMap && value != null && typeof value === 'object') {
              const remapped: RangeSelection = {};
              for (const [k, v] of Object.entries(value)) {
                remapped[fieldMap[k] ?? k] = v as [number, number];
              }
              routeSelectionUpdate(signalKey, remapped);
            } else {
              routeSelectionUpdate(signalKey, value as RangeSelection | null);
            }
          });
        }
      }
      if (props.pointSelect) {
        // Capture the prop into a local so its narrowing survives into the
        // click closure — TS otherwise widens `props.pointSelect` back to
        // `PointSelect | null | undefined` inside the callback because props
        // could in principle change between subscription and click.
        const point = props.pointSelect;
        // if the signal is a point selection we I couldn't get signals
        // to work with dynamic data, so click events it is!
        view.addEventListener('click', function (event, item) {
          // A category label stands in for its marks: the selection gets the
          // guide's field alone, so an axis label picks a stacked bar whole
          // and a legend entry every segment of its color.
          const markName = (item?.mark as { name?: string } | undefined)?.name;
          const guide =
            markName === CLICKABLE_LABELS
              ? axis
              : markName === CLICKABLE_LEGEND ||
                  markName === CLICKABLE_LEGEND_SYMBOLS
                ? legend
                : null;
          const guideValue = guide
            ? (item as { datum?: { value?: unknown } }).datum?.value
            : undefined;
          // No fields → no selection to build; bail.
          const fields = guide ? [guide.field] : selectFields(point.fields);
          if (fields.length === 0) return;
          const datum = guide
            ? { [guide.field]: guideValue }
            : (item as { datum?: Record<string, unknown> })?.datum;
          // A modifier held: add the click to the gesture's picks, commit
          // nothing until it is released. Starting here too covers a key
          // press the keydown listener didn't see (focus elsewhere).
          const mode = pickModeOf(event);
          if (mode) startPickGesture(mode);
          if (pickMode === 'toggle') {
            if (datum) {
              pendingPicks = togglePointValues(pendingPicks, datum, fields);
              applyPickSignal();
            }
            return;
          }
          if (pickMode === 'range') {
            // A range runs along one field, in its scale's order: the clicked
            // guide's (a legend entry picks colors), else a bar chart's
            // category axis (whole bars, as a label click picks), or else the
            // selection's first field.
            const rangeGuide = guide ?? (axis?.clickable ? axis : null);
            const rangeField = rangeGuide ? rangeGuide.field : fields[0];
            const channel = rangeGuide
              ? rangeGuide.channel
              : rangeField && fieldChannel(specObject, rangeField);
            if (datum && rangeField && channel) {
              const value = String(datum[rangeField]);
              // Moving to another guide mid-gesture starts a new range there.
              if (rangeAnchorField !== rangeField) rangeAnchor = null;
              rangeAnchorField = rangeField;
              rangeAnchor ??= value;
              let domain: unknown[] = [];
              try {
                domain = view.scale(channel).domain();
              } catch {
                // No scale on that channel: the range is just its two ends.
              }
              pendingPicks = {
                [rangeField]: rangePicks(domain, rangeAnchor, value),
              };
              applyPickSignal();
            }
            return;
          }
          if (!datum) {
            dataSourcesStore.clearDataSelection(point.name);
          } else {
            // Coerce the (unknown) datum field values to string — that's
            // what `PointSelection` is declared as in DataSourcesStore.
            // CSV-derived data flows through Arquero as primitives; the
            // String() coercion preserves number/boolean keys verbatim
            // and is safe even when the underlying column is mixed-type.
            const pointSelection: Record<string, string[]> = {};
            for (const f of fields) {
              pointSelection[f] = [String(datum[f])];
            }
            dataSourcesStore.updateDataSelection(point.name, pointSelection);
          }
        });
      }

      updateVegaChart();
      // Restore any active brush after a re-embed (resize / palette change);
      // a fresh view starts with no selection rect even though Pinia still
      // holds the selection. No-op on initial mount when there's none.
      updateVegaChartSelections();
      // Same for a gesture's picks highlight.
      applyPickSignal();
    })
    .catch((error) => {
      console.error('Error rendering chart', error);
      errorMessage.value = 'Error rendering chart: ' + error.toString();
      // clear the container so the chart doesn't show up
      vegaContainer.value.innerHTML = '';
    });
}

// Re-embed (not just resize) when the container changes size. Vega-Lite bakes
// each axis's tick COUNT from the width at compile time; view.resize() only
// repositions those baked ticks, so at a new width they crowd and overlap and
// never match a fresh load. Recompiling the spec for the new container size is
// the only way to get correct ticks. Debounced trailing so a drag-resize
// re-renders once on settle instead of flickering every frame.
//
// Only react when the spec uses container sizing on some axis; a fixed-size
// chart doesn't care about its container's size. `lastW/lastH` skip the
// ResizeObserver's initial fire and any no-op callbacks (and, with fit-x, the
// chart fits its container exactly so a re-embed never changes the container
// size — no feedback loop).
let resizeObserver: ResizeObserver | null = null;
let widthIsContainer = false;
let heightIsContainer = false;
let lastW = 0;
let lastH = 0;

const reembedForResize = debounce(() => {
  if (!vegaView.value) return;
  // The live brush rect lives on the Vega view and is dropped by finalize();
  // the active selection itself lives in Pinia (props.selections) and is
  // re-applied by initVegaChart below, so cross-filtering survives the resize.
  vegaView.value.finalize();
  vegaView.value = null;
  initVegaChart();
}, 150);

// Multi-select for point selections. Holding a modifier over the chart freezes
// it: nothing is committed, so neither this chart nor any other re-queries.
// With Ctrl (⌘ on macOS), clicks toggle the drawn marks into `pendingPicks`;
// with Shift, they pick every category from the first click to the latest.
// Either way the rest dim via PICK_SIGNAL, and releasing the key commits the
// picks as one selection — one query, whatever was picked. So does anything
// that could swallow that release: the pointer leaving the chart, the window
// losing focus or the page being hidden. Marks the chart's own filter already
// hides can't be picked: their rows were never fetched (a rollup skips the
// unfiltered pass), so adding one means clearing the selection first.
let pickMode: PickMode | null = null;
let pendingPicks: Record<string, string[]> | null = null;
// A Shift gesture's first click, which its range runs from; null until then,
// and a Shift gesture that never clicks leaves the selection as it was.
let rangeAnchor: string | null = null;
// The field that anchor belongs to.
let rangeAnchorField: string | null = null;
let pointerOverChart = false;
// Cleared by typing into a field, set by moving the pointer over the chart: a
// capital letter typed in the chat while the pointer happens to rest on a
// chart must not start a gesture.
let pickArmed = false;

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  );
}

function applyPickSignal(): void {
  if (!vegaView.value || !props.pointSelect) return;
  try {
    vegaView.value.signal(PICK_SIGNAL, pickMode ? (pendingPicks ?? {}) : null);
    void vegaView.value.runAsync();
  } catch {
    // The layer maps opacity itself, so UDIVis emitted no pick signal.
  }
}

// Both modes start from the current selection, so holding a key dims nothing
// new until a click; a range's first click then replaces it.
function startPickGesture(mode: PickMode): void {
  if (pickMode || !props.pointSelect) return;
  pickMode = mode;
  rangeAnchor = null;
  rangeAnchorField = null;
  const current =
    dataSourcesStore.dataSelections[props.pointSelect.name]?.selection;
  pendingPicks = current
    ? (JSON.parse(JSON.stringify(current)) as Record<string, string[]>)
    : null;
  applyPickSignal();
}

function endPickGesture(): void {
  if (!pickMode || !props.pointSelect) return;
  const unchanged = pickMode === 'range' && rangeAnchor === null;
  pickMode = null;
  rangeAnchor = null;
  rangeAnchorField = null;
  const name = props.pointSelect.name;
  if (unchanged) {
    // Shift was held and released without a click.
  } else if (pendingPicks) {
    dataSourcesStore.updateDataSelection(name, pendingPicks);
  } else {
    dataSourcesStore.clearDataSelection(name);
  }
  pendingPicks = null;
  applyPickSignal();
}

function onPickKeyDown(event: KeyboardEvent): void {
  if (isEditable(event.target)) {
    pickArmed = false;
    return;
  }
  const mode = keyPickMode(event.key);
  if (mode && pointerOverChart && pickArmed) startPickGesture(mode);
}
function onPickKeyUp(event: KeyboardEvent): void {
  if (pickMode && keyPickMode(event.key) === pickMode) endPickGesture();
}
function onPickPointerMove(event: PointerEvent): void {
  pointerOverChart = true;
  pickArmed = true;
  // The key's release can go unseen (a context menu had it), but every pointer
  // event carries the modifiers actually held.
  if (pickMode && !holdsPickMode(event, pickMode)) endPickGesture();
  const mode = pickModeOf(event);
  if (mode) startPickGesture(mode);
}
function onPickPointerLeave(): void {
  pointerOverChart = false;
  endPickGesture();
}
function onPickVisibilityChange(): void {
  if (document.hidden) endPickGesture();
}
// A modifier click would otherwise also extend the page's text selection,
// highlighting every axis label between two Shift-clicks.
function onPickMouseDown(event: MouseEvent): void {
  if (props.pointSelect && pickModeOf(event)) event.preventDefault();
}

// The running view's bar category axis and color legend (grayed-out /
// clickable labels), if any.
let labelAxis: LabelAxis | null = null;
let labelLegend: LabelAxis | null = null;

// Hovering a clickable label underlines it. Chrome won't draw an animatable
// underline on SVG text — it ignores text-underline-offset there and paints the
// decoration in the text's fill — so the underline is an HTML element laid over
// the label. It is created on demand rather than rendered by Vue because
// vega-embed empties the container on every embed.
let labelUnderline: HTMLDivElement | null = null;

function labelText(event: PointerEvent): SVGTextElement | null {
  const target = event.target as Element | null;
  return (
    target?.closest?.<SVGTextElement>(
      `.${CLICKABLE_LABELS} text, .${CLICKABLE_LEGEND} text`,
    ) ?? null
  );
}

function onLabelPointerOver(event: PointerEvent): void {
  const text = labelText(event);
  const container = vegaContainer.value as HTMLElement | undefined;
  const ctm = text?.getScreenCTM();
  if (!text || !container || !ctm) return;
  if (!labelUnderline?.isConnected) {
    labelUnderline = document.createElement('div');
    labelUnderline.className = 'udi-label-underline';
    labelUnderline.appendChild(document.createElement('span'));
    container.appendChild(labelUnderline);
  }
  const rect = container.getBoundingClientRect();
  const { left, top, width, angle } = underlineGeometry(
    text.getBBox(),
    (x, y) => {
      const point = new DOMPoint(x, y).matrixTransform(ctm);
      return {
        x: point.x - rect.left - container.clientLeft + container.scrollLeft,
        y: point.y - rect.top - container.clientTop + container.scrollTop,
      };
    },
  );
  Object.assign(labelUnderline.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    transform: `rotate(${angle}rad)`,
    color: getComputedStyle(text).fill,
  });
  // Restart the transition, so moving from one label to the next slides the
  // underline in again instead of jumping it across.
  labelUnderline.classList.remove('shown');
  void labelUnderline.offsetWidth;
  labelUnderline.classList.add('shown');
}

function onLabelPointerOut(event: PointerEvent): void {
  if (labelText(event)) labelUnderline?.classList.remove('shown');
}

// Remote (non-interactive) mode: each live brush tick would trigger a server
// round-trip, so buffer ticks here and commit once on pointer release. The
// listeners are window-level so releasing outside the chart still commits.
// NOTE: 'pointerup' is the primary trigger — Vega cancels pointerdown
// (preventDefault) during brush drags, which per the pointer-events spec
// SUPPRESSES compatibility mouse events, so a 'mouseup'-only listener never
// fires after a brush. 'mouseup' is kept as a fallback for non-pointer
// environments; the flush is idempotent (the map clears), so double-firing
// is harmless.
const pendingRemoteCommits = new Map<string, RangeSelection | null>();
function commitRemoteSelections(): void {
  for (const [key, selection] of pendingRemoteCommits) {
    dataSourcesStore.updateDataSelection(key, selection);
  }
  pendingRemoteCommits.clear();
}
function routeSelectionUpdate(
  signalKey: string,
  selection: RangeSelection | null,
): void {
  if (getQueryBackend().kind === 'remote') {
    pendingRemoteCommits.set(signalKey, selection);
  } else {
    dataSourcesStore.updateDataSelection(signalKey, selection);
  }
}

onMounted(() => {
  window.addEventListener('pointerup', commitRemoteSelections);
  window.addEventListener('pointercancel', commitRemoteSelections);
  window.addEventListener('mouseup', commitRemoteSelections);
  window.addEventListener('keydown', onPickKeyDown);
  window.addEventListener('keyup', onPickKeyUp);
  window.addEventListener('blur', endPickGesture);
  document.addEventListener('visibilitychange', onPickVisibilityChange);
  vegaContainer.value?.addEventListener('pointermove', onPickPointerMove);
  vegaContainer.value?.addEventListener('pointerleave', onPickPointerLeave);
  vegaContainer.value?.addEventListener('mousedown', onPickMouseDown);
  vegaContainer.value?.addEventListener('pointerover', onLabelPointerOver);
  vegaContainer.value?.addEventListener('pointerout', onLabelPointerOut);
  initVegaChart();
  if (vegaContainer.value && typeof ResizeObserver !== 'undefined') {
    lastW = vegaContainer.value.offsetWidth;
    lastH = vegaContainer.value.offsetHeight;
    resizeObserver = new ResizeObserver(() => {
      if (!widthIsContainer && !heightIsContainer) return;
      const el = vegaContainer.value;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w <= 0 || h <= 0) return; // detached / display:none
      if (w === lastW && h === lastH) return; // initial fire / no real change
      lastW = w;
      lastH = h;
      reembedForResize();
    });
    resizeObserver.observe(vegaContainer.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', commitRemoteSelections);
  window.removeEventListener('pointercancel', commitRemoteSelections);
  window.removeEventListener('mouseup', commitRemoteSelections);
  window.removeEventListener('keydown', onPickKeyDown);
  window.removeEventListener('keyup', onPickKeyUp);
  window.removeEventListener('blur', endPickGesture);
  document.removeEventListener('visibilitychange', onPickVisibilityChange);
  vegaContainer.value?.removeEventListener('pointermove', onPickPointerMove);
  vegaContainer.value?.removeEventListener('pointerleave', onPickPointerLeave);
  vegaContainer.value?.removeEventListener('mousedown', onPickMouseDown);
  vegaContainer.value?.removeEventListener('pointerover', onLabelPointerOver);
  vegaContainer.value?.removeEventListener('pointerout', onLabelPointerOut);
  reembedForResize.cancel();
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

// Update data in the existing Vega view, preserving brush/selection state.
async function updateVegaChart() {
  if (!vegaView.value) return;
  const { success, specObject } = parseSpec();
  if (!success || isEmpty(specObject)) return;

  // Only the rows can be swapped in place. Anything else — a scale domain that
  // moved because a filter changed the data extent, a field an encoding now
  // points at — has to be recompiled, or the view keeps drawing the new data
  // through the old spec. The changeset path below stays the fast one for the
  // case it was built for: a brush, where only the rows change.
  if (specShape(specObject) !== embeddedSpecShape) {
    vegaView.value.finalize();
    vegaView.value = null;
    // Re-applies props.selections itself, as the resize re-embed does.
    initVegaChart();
    return;
  }

  // For a brush that has an EXTERNAL selection (props.selections — e.g. the
  // chat adjustment widget / filter chips mirror brushes there), that
  // selection is the source of truth: we re-apply it in DATA space after the
  // rebuild (see updateVegaChartSelections below), so it never needs the
  // pixel save/restore. Only brushes WITHOUT an external mirror (a purely
  // local live brush, e.g. bare toolkit/Storybook usage) fall back to saving
  // and restoring their pixel signals across the data changeset — pixel
  // values are scale-relative, so this is a best-effort preservation for the
  // no-external-selection case only.
  const hasExternal = (signalKey: string) =>
    props.selections?.[signalKey]?.selection != null;
  const savedSignals: Record<string, unknown> = {};
  for (const signalKey of props.signalKeys ?? []) {
    if (hasExternal(signalKey)) continue;
    const sk = formatVegaSignalKey(signalKey);
    const tupleFieldsKey = sk + '_tuple_fields';
    const state = vegaView.value.getState().signals;
    if (!state) continue;
    const tupleFields = state[tupleFieldsKey] as
      Array<{ channel: string; field: string }> | undefined;
    for (const tf of tupleFields ?? []) {
      const channelSignal = `${sk}_${tf.channel}`;
      const val = state[channelSignal];
      // Only save truly active brush ranges: non-empty 2-tuple with
      // distinct endpoints. This avoids preserving stale or cleared state.
      if (
        Array.isArray(val) &&
        val.length === 2 &&
        typeof val[0] === 'number' &&
        typeof val[1] === 'number' &&
        val[0] !== val[1]
      ) {
        savedSignals[channelSignal] = val;
      }
    }
  }

  ignore.value = true;
  vegaView.value.change(
    'udi_data',
    changeset()
      .remove(() => true)
      .insert(specObject.data.values ?? []),
  );
  // The label tooltips and gray-out read each category's total from here, so
  // they track the filtered rows the marks draw.
  if (labelAxis) {
    vegaView.value.signal(
      LABEL_TOTALS_SIGNAL,
      categoryTotals(specObject.data.values ?? [], labelAxis),
    );
  }
  if (labelLegend) {
    vegaView.value.signal(
      LEGEND_TOTALS_SIGNAL,
      categoryTotals(specObject.data.values ?? [], labelLegend),
    );
  }

  // Restore only the verified-active brush signals (no-external-selection case)
  for (const [key, value] of Object.entries(savedSignals)) {
    vegaView.value.signal(key, value);
  }

  // .resize() forces the view to recompute layout (scale ranges, axis
  // positions, etc.) based on current state. Without it, Vega can leave
  // stale derived state after a data changeset — manifesting as points
  // rendered at positions that don't match the axis (e.g. after a brush
  // is dismissed).
  await vegaView.value.resize().runAsync();
  ignore.value = false;

  // Re-assert the external selection as the FINAL step, against the now-
  // current (post-resize) scales. This makes the rendered brush a
  // deterministic function of props.selections regardless of watcher/query
  // ordering — the fix for "editing a filter's sliders doesn't move the
  // brush". No-op when props.selections is empty.
  await updateVegaChartSelections();
}

watch(() => props.spec, updateVegaChart);

// The palette only feeds the embed-time `config`, so a change requires a full
// re-embed (not just a data update). Finalize the existing view first so its
// dataflow / listeners don't leak. Palette is a consumer-level config that
// rarely changes, so re-embedding (and dropping any active brush) is fine.
watch(
  () => props.palette,
  () => {
    if (vegaView.value) {
      vegaView.value.finalize();
      vegaView.value = null;
    }
    initVegaChart();
  },
  { deep: true },
);

async function updateVegaChartSelections() {
  // console.log('UDI-VIS: vegaChartSelections triggered', props.selections);
  // console.log('vega-lite selections changed');
  // only handles data changes
  if (!vegaView.value) return;
  if (!props.selections) return; // Do I actually need to clear selections here?
  ignore.value = true;
  // console.log('Current signals:', currentSignals);

  // Only this chart's own brushes. The map holds every chart's selections
  // (a source chart renders its brush from it), and asking Vega for a signal
  // this view doesn't define throws — one error per foreign brush per chart on
  // every selection change. signalKeys lists exactly the interval signals this
  // chart owns, which is all updateVegaChartSelection applies.
  const own = new Set(props.signalKeys ?? []);
  for (const [selectionName, selection] of Object.entries(props.selections)) {
    if (!own.has(selectionName)) continue;
    // Isolate each selection: a malformed entry must not abort applying the
    // others.
    try {
      updateVegaChartSelection(selectionName, selection);
    } catch (error) {
      console.error(`Failed to apply selection "${selectionName}"`, error);
    }
  }

  await vegaView.value.runAsync();
  ignore.value = false;
}

function updateVegaChartSelection(
  selectionName: string,
  selection: ActiveDataSelection,
) {
  if (!vegaView.value) return;
  if (selection.type !== 'interval') return;

  const signalKeyStart = formatVegaSignalKey(selectionName);

  // Read the interval's tuple fields the SAME way the working read path does
  // (initVegaChart's brush listeners): via `view.signal(...)`, NOT
  // `getState().signals`. getState() applies Vega's default signal filter,
  // which can omit `_tuple_fields` in the embedded canvas view and made this
  // whole function silently no-op. `view.signal` THROWS for a name this view
  // doesn't define, so the caller passes only this chart's own brushes; an
  // empty tuple (a brush not drawn yet) → nothing to do.
  const tupleFields = vegaView.value.signal(
    `${signalKeyStart}_tuple_fields`,
  ) as Array<{ channel: string; field: string }> | undefined;
  if (!Array.isArray(tupleFields) || tupleFields.length === 0) return;

  // Reverse field map: stored (possibly remapped) field -> encoding field,
  // so a selection keyed by the display/override field still resolves to the
  // right x/y channel.
  const reverseFieldMap: Record<string, string> = {};
  const fmap = props.signalFieldMap?.[selectionName];
  if (fmap) {
    for (const [encodingField, remappedField] of Object.entries(fmap)) {
      reverseFieldMap[remappedField] = encodingField;
    }
  }

  const rangeSelection = (selection.selection ?? {}) as RangeSelection;
  const fieldEntries = Object.entries(rangeSelection);

  for (let i = 0; i < fieldEntries.length; i++) {
    const [field, range] = fieldEntries[i];
    if (!Array.isArray(range) || range.length !== 2) continue;
    const vegaField = reverseFieldMap[field] ?? field;

    // Resolve the channel by field match; fall back to the tuple entry at the
    // same position when the field name doesn't line up (keeps a 2D brush
    // working even if the stored keys and encoding fields diverge).
    let channel = tupleFields.find((t) => t.field === vegaField)?.channel;
    if (channel !== 'x' && channel !== 'y') {
      channel = tupleFields[i]?.channel;
    }
    if (channel !== 'x' && channel !== 'y') continue;

    const signalKeyFull = `${signalKeyStart}_${channel}`;
    const testNew = toPixelRange(range, channel);

    // Skip only when the current signal is a usable 2-number tuple that
    // already matches — otherwise (empty/null/uninitialised) always write,
    // and never let a bad `currentVal` throw and abort the loop.
    const currentVal = vegaView.value.signal(signalKeyFull);
    if (
      Array.isArray(currentVal) &&
      currentVal.length === 2 &&
      typeof currentVal[0] === 'number' &&
      typeof currentVal[1] === 'number'
    ) {
      const closeEnough = (x: number, y: number, eps = 1e-6) =>
        Math.abs(x - y) < eps;
      if (
        closeEnough(Math.min(...currentVal), Math.min(...testNew)) &&
        closeEnough(Math.max(...currentVal), Math.max(...testNew))
      ) {
        continue;
      }
    }

    vegaView.value.signal(signalKeyFull, testNew);
  }
}

function toPixelRange(
  dataRange: [number, number],
  channel: 'x' | 'y',
): [number, number] {
  if (!vegaView.value) return [0, 0];
  const sx = vegaView.value.scale(channel);
  return [sx(dataRange[0]), sx(dataRange[1])] as [number, number];
}

function fromPixelRange(
  pixelRange: [number, number],
  channel: 'x' | 'y',
): [number, number] {
  if (!vegaView.value) return [0, 0];
  const sx = vegaView.value.scale(channel);
  const a = sx.invert(pixelRange[0]) as number;
  const b = sx.invert(pixelRange[1]) as number;
  // Y-axis pixels are inverted (0 = top), so always normalize to [min, max]
  return [Math.min(a, b), Math.max(a, b)];
}

watch(() => props.selections, updateVegaChartSelections, { deep: true });
</script>

<template>
  <div
    class="udi-vega-wrap"
    :class="{ 'udi-point-selectable': pointSelectable }"
    :style="hintColors"
  >
    <div ref="vegaContainer" class="vega-chart-container"></div>
    <div v-if="hint" class="udi-interaction-hint" aria-hidden="true">
      {{ hint }}
    </div>
  </div>
  <div v-if="errorMessage" class="vega-error-message">
    {{ errorMessage }}
  </div>
</template>

<style scoped>
.udi-vega-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.vega-chart-container {
  width: 100%;
  height: 100%;
  /* max-width: 600px; */
  overflow-x: auto;
}

.vega-error-message {
  color: red;
}
</style>

<style>
/* Ensure Vega tooltips render above containers with high z-index (e.g. MUI dialogs at 1300).
   vega-tooltip portals the tooltip to <body> with a default z-index of 1000, which loses
   to higher-z-index ancestors of the chart's mounting container. */
#vg-tooltip-element {
  z-index: 2147483647;
}

/* Clickable category labels (axisLabelSelect.ts). Global, not scoped: Vega draws
   the labels and VegaLite.vue creates the underline imperatively, so neither
   carries this component's scope attribute. */
.udi-clickable-labels text,
.udi-clickable-legend text,
.udi-clickable-legend-symbols path {
  cursor: pointer;
}
/* A point-selectable chart's marks: a pointer, and a light touch on the one
   under it. .role-mark leaves axes and legends to the rules above. */
.udi-point-selectable .role-mark path {
  cursor: pointer;
  transition: filter 120ms ease-out;
}
.udi-point-selectable .role-mark path:hover {
  filter: brightness(0.9) saturate(1.15);
}
/* The gesture a chart takes, named on hover. Sized to the x-axis title's row
   and kept in its left corner, below the y labels and the x ticks and clear of
   a right-hand legend. The delay keeps it from flashing while the pointer
   crosses the dashboard; pressing hides it, so it never sits on a brush being
   drawn. */
.udi-interaction-hint {
  position: absolute;
  left: 0;
  bottom: 0;
  padding: 0 6px;
  border: 1px solid var(--udi-hint-border);
  border-radius: 9999px;
  background: var(--udi-hint-bg, Canvas);
  color: var(--udi-hint-fg);
  font-size: 10px;
  line-height: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease-out;
}
.udi-vega-wrap:hover .udi-interaction-hint {
  opacity: 0.9;
  transition-delay: 400ms;
}
.udi-vega-wrap:active .udi-interaction-hint {
  opacity: 0;
  transition-delay: 0s;
}
.udi-label-underline {
  position: absolute;
  transform-origin: 0 0;
  pointer-events: none;
}
.udi-label-underline > span {
  display: block;
  height: 1px;
  background: currentColor;
  opacity: 0;
  transform: translateY(5px);
  transition:
    transform 180ms ease-out,
    opacity 180ms ease-out;
}
.udi-label-underline.shown > span {
  opacity: 1;
  transform: translateY(1px);
}
@media (prefers-reduced-motion: reduce) {
  .udi-label-underline > span {
    transition: none;
  }
}
</style>
