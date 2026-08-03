<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
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

  const config: Record<string, unknown> = {
    point: { shape: 'circle', filled: true },
    range,
  };
  if (markColor != null) config.mark = { color: markColor };
  return config;
}

const vegaContainer = ref();
const vegaView = ref<View | null>(null);

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

  if (specObject.data && specObject.data.values) {
    delete specObject.data.values;
  }
  // console.log('initializing vega chart with spec:', specObject);
  vegaEmbed(vegaContainer.value, specObject as VisualizationSpec, {
    actions: props.hideActions ? false : true,
    config: buildVegaConfig(),
  })
    .then((result) => {
      errorMessage.value = null;
      const view = result.view;
      vegaView.value = view;
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
          // Normalize the optional `fields` (string | string[] | undefined)
          // to an iterable list of strings. No fields → no selection to
          // build; bail.
          const raw = point.fields;
          const fields: string[] =
            raw == null ? [] : typeof raw === 'string' ? [raw] : raw;
          if (fields.length === 0) return;
          const datum = (item as { datum?: Record<string, unknown> })?.datum;
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

  for (const [selectionName, selection] of Object.entries(props.selections)) {
    // Isolate each selection: a malformed entry (or one for a signal this
    // chart doesn't have) must not abort applying the others.
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
  // whole function silently no-op. A missing tuple (this chart has no such
  // interval selection) → nothing to do.
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
  <div ref="vegaContainer" class="vega-chart-container"></div>
  <div v-if="errorMessage" class="vega-error-message">
    {{ errorMessage }}
  </div>
</template>

<style scoped>
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
</style>
