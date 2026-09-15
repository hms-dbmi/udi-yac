# udi-render-repro

Dev-only. A minimal reproduction of the stale-render bug
([hms-dbmi/udi-yac#34](https://github.com/hms-dbmi/udi-yac/issues/34)), isolated from the YAC app.

```bash
pnpm dev:repro          # http://localhost:5176
```

## What it is

Four static specs over the penguins sample package, and one button that toggles one filter.

Three of the specs are the agent's own templates instantiated once and baked into `src/specs.json`
(grouped CDF, grouped KDE, plain CDF — the first two are the charts named in the issue). The fourth
is hand-built to mirror the stratified survival stack: five layers over a single dataset, a nominal
colour facet, and columns that are null on all but one row per stratum, so each layer sits behind
its own null filter.

## What it deliberately does not have

No agent, no chat, no dashboard store, no spec rewriting, no template re-binding, no cross-entity
bridging. The spec objects are constructed once and never change — only the selection does. So
anything that reproduces here cannot be blamed on spec generation.

## What it keeps from YAC

The two things that make a YAC filter a YAC filter:

- a **named filter transform** prepended to the spec (`{ filter: { name }, in, out }`), the shape
  `dashboardStore.getNamedFilters` emits;
- the selection handed down the **`selections` prop of `UDIVis`**, which binds it into the toolkit's
  shared Pinia store, where the Arquero executor resolves the named filter against it.

The filter drops a category with a point selection, mirroring the sharpest known reproduction
("filter on vital status, remove alive, toggle back and forth").

## A trap worth knowing

`udi-toolkit/react` does **not** import the toolkit's stylesheet, and the custom
element renders into light DOM, so its scoped styles are not injected for you.
`main.tsx` imports `udi-toolkit/style.css`; without it
`.vega-chart-container { width: 100%; height: 100% }` is missing, the chart
compiles at zero size, and every chart renders as nothing but vega-embed's
actions button — no error, no warning. Chat gets away without the explicit
import because its bundled CSS already pulls it in.

## A second trap

Turning a filter _off_ means passing its key with `selection: null`, not dropping
the key. `bindExternalDataSelections` iterates only the keys it is handed, so a
key that disappears leaves the store's previous value untouched — the filter
applies once and then never lifts, with no error. `App.tsx` therefore always
sends the key.

## Controls

- **Chart dropdown** — one chart at a time. Whichever is selected gets the brush,
  so the linked interaction follows the selection rather than being tied to one
  spec. The chart remounts on change, so each starts from a clean view.
- **Re-embed** — remounts the chart, tearing down and recompiling the Vega view.
  This is the same thing toggling to table view and back does in YAC, and the
  only known way to clear a stale frame. It is here to make the bug legible:
  leave a bad frame on screen, press it, and watch the picture change while the
  row count beside the title does not.
- **body_mass_g range slider** — an interval selection, two-way bound to the
  brush inside the selected chart. Drag in the chart and the slider follows; move
  the slider and the chart's brush follows. It filters the chart that owns it,
  because chat puts a viz's own brush id in its own filter list too.

This is the only filter. A category toggle reached just two data states, while a
slider produces a continuum and fires many rapid updates through the changeset
path — which is what the original report described ("adjust the slider until the
dashed rule kinks").

The brush is injected onto the layer whose **x** encoding is `body_mass_g`, not
onto the first layer: the brushed layer's x decides what the selection is keyed
by, and the survival-shaped spec's first layer plots a lead-in column that is
null nearly everywhere.

## `/raw.html` — the same failure with the toolkit removed

`pnpm dev:repro`, then open <http://localhost:5176/raw.html>.

Everything the toolkit contributes is pre-computed and frozen:

- `src/vega-spec.json` is the exact Vega-Lite spec `UDIVis.convertToVegaSpec`
  produced for the grouped-CDF chart, captured from a running instance rather
  than re-derived — so the scale domains, the brush param and the layer shape are
  the real ones.
- `src/cdf.ts` recomputes the rows for an arbitrary range in plain JS, so the
  brush can drive the data here as it does in the real app. It is checked on
  startup against `src/raw-frames.json` — 24 row sets the real Arquero executor
  produced — and the page prints the verdict, so a divergence in the port can
  never be mistaken for the rendering bug.

What is left is vega-embed, one changeset per change, and the brush wired back to
the data: no Vue, no custom element, no Pinia, no `UDIVis`, no `VegaLite.vue`.
The changeset sequence mirrors `VegaLite.updateVegaChart` — remove everything,
insert fresh row objects, then `resize().runAsync()` — and the brush/slider
binding mirrors its `toPixelRange` / `fromPixelRange` conversions.

### The result

**It does not reproduce here.** The same spec, the same rows and the same
changeset sequence, driven from both the slider and the chart's own brush, render
correctly however hard they are pushed — while `/` misbehaves on the same data.

So the cause is not Vega or Vega-Lite mishandling a changeset. It is in what the
toolkit adds on top, and the delta between the two pages is the search space:

- `UDIVis.vue` / `VegaLite.vue` and the Vue custom-element wrapper around them
- the brush-signal save/restore that wraps the changeset in `updateVegaChart`
- the second `runAsync` in `updateVegaChartSelections`
- Vue reactivity driving the update, rather than one awaited call per change

One caveat on how far to push that. This page applies each update discretely and
awaits it; a real drag through the toolkit fires overlapping, un-awaited updates.
So "raw Vega is fine" is established for a _sequence_ of changesets, not for
_concurrent_ ones. If the cause turns out to be a race, that difference — not the
wrapper — would be the thing that matters.

### Regenerating the captured files

Neither is derived at build time, so both need re-capturing if the spec or the
pipeline changes.

`vega-spec.json` — temporarily add a `console.warn(JSON.stringify(specObject))`
to `initVegaChart` in `packages/grammar/VegaLite.vue`, rebuild the toolkit, then
drive the custom element under jsdom from `packages/chat` (which has jsdom
installed) and collect the dump. vega-embed itself fails under jsdom for want of
a canvas, which does not matter: the dump happens before the embed. Revert the
instrumentation afterwards.

`raw-frames.json` — seed the penguins CSV into a `DataSourcesStore`, then call
`getDataObject` once per filter range with the named filter bound, projecting to
the columns the compiled spec reads.

## Using it

Toggle the button repeatedly. The bug is a chart that draws something its data no longer contains —
on the survival-shaped chart the tell is the flat rule at the right, on the CDF a line that kinks, on
the KDE a curve that is not clipped at the bounds. Resizing the window corrects it, because the
toolkit re-embeds on resize.

If it reproduces here, the next step is to simplify: drop specs, drop layers, drop the colour facet,
until the smallest failing case remains. If it does **not** reproduce here, the cause is upstream in
YAC rather than in the toolkit, and that is worth just as much.
