import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import embed, { type Result } from "vega-embed";
import { changeset, type View } from "vega";
import vegaSpec from "./vega-spec.json";
import frames from "./raw-frames.json";
import { computeCdf, verifyAgainstFrames, type Row } from "./cdf";
import { RangeSlider } from "./RangeSlider";
import "./index.css";

/**
 * The same chart with the toolkit removed from the render path.
 *
 *   - `vega-spec.json` is the exact Vega-Lite spec `UDIVis.convertToVegaSpec`
 *     produced, captured from a running instance rather than re-derived.
 *   - `cdf.ts` recomputes the rows for an arbitrary range, checked on startup
 *     against 24 row sets the real Arquero executor produced.
 *
 * What is left is vega-embed, one changeset per change, and the brush wired back
 * to the data — no Vue, no custom element, no Pinia, no `UDIVis`. The changeset
 * sequence and the pixel/data signal conversions mirror `VegaLite.vue`.
 */

const SIGNAL = "mass_filter"; // vega sanitises the param name's dash
const DOMAIN: [number, number] = [2700, 6300];
type Frame = { range: [number, number]; rows: Row[] };

function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const resultRef = useRef<Result | null>(null);
  // Two guards, because the binding is a cycle: the slider writes the brush
  // signal, which fires the brush listener, which sets the range, which writes
  // the signal again. `syncing` suppresses the listener while we are the ones
  // writing; `fromBrush` stops us writing back at all when the change started at
  // the brush, so a drag never fights itself.
  const syncing = useRef(false);
  const fromBrush = useRef(false);
  const rangeRef = useRef<[number, number] | null>(null);
  const [source, setSource] = useState<
    { species: string; body_mass_g: number }[] | null
  >(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [embedKey, setEmbedKey] = useState(0);
  const [drawn, setDrawn] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("checking…");

  useEffect(() => {
    void fetch("./data/penguins/penguins.csv")
      .then((r) => r.text())
      .then((text) => {
        const [head, ...lines] = text.trim().split("\n");
        const cols = head.split(",");
        const si = cols.indexOf("species");
        const mi = cols.indexOf("body_mass_g");
        const rows = lines
          .map((l) => l.split(","))
          .map((c) => ({ species: c[si], body_mass_g: Number(c[mi]) }))
          .filter((r) => Number.isFinite(r.body_mass_g));
        setSource(rows);
        setVerdict(verifyAgainstFrames(rows, frames as unknown as Frame[]));
      });
  }, []);

  const applyRows = useCallback(async (view: View, rows: Row[]) => {
    view.change(
      "udi_data",
      changeset()
        .remove(() => true)
        .insert(rows.map((r) => ({ ...r }))),
    );
    await view.resize().runAsync();
    setDrawn((view.data("udi_data") as unknown[] | undefined)?.length ?? 0);
  }, []);

  // Embed once per re-embed, with no rows — as initVegaChart does.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !source) return;
    let cancelled = false;
    const spec = JSON.parse(JSON.stringify(vegaSpec)) as Record<
      string,
      unknown
    >;
    delete (spec.data as { values?: unknown }).values;
    void embed(host, spec as never, { actions: true }).then((result) => {
      if (cancelled) {
        result.view.finalize();
        return;
      }
      resultRef.current = result;
      viewRef.current = result.view;
      // Brush -> data. Pixel signal in, data range out, exactly as VegaLite.vue
      // does with fromPixelRange.
      result.view.addSignalListener(`${SIGNAL}_x`, (_n, value) => {
        if (syncing.current) return; // our own write, not the user's drag
        const px = value as [number, number] | null;
        if (!Array.isArray(px) || px.length !== 2 || px[0] === px[1]) return;
        const scale = result.view.scale("x");
        const a = scale.invert(px[0]) as number;
        const b = scale.invert(px[1]) as number;
        const next: [number, number] = [
          Math.round(Math.min(a, b)),
          Math.round(Math.max(a, b)),
        ];
        const prev = rangeRef.current;
        if (prev && prev[0] === next[0] && prev[1] === next[1]) return;
        fromBrush.current = true;
        setRange(next);
      });
      void applyRows(result.view, computeCdf(source, range));
    });
    return () => {
      cancelled = true;
      resultRef.current?.view.finalize();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedKey, source]);

  // Range -> data, and (only when the range did not come from the brush)
  // range -> brush rect.
  useEffect(() => {
    rangeRef.current = range;
    const view = viewRef.current;
    if (!view || !source) return;
    const cameFromBrush = fromBrush.current;
    fromBrush.current = false;
    void applyRows(view, computeCdf(source, range)).then(() => {
      if (cameFromBrush) return; // the rect is already where the user put it
      syncing.current = true;
      const scale = view.scale("x");
      if (range) view.signal(`${SIGNAL}_x`, [scale(range[0]), scale(range[1])]);
      else view.signal(`${SIGNAL}_x`, null);
      void view.runAsync().finally(() => {
        syncing.current = false;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, source]);

  const computedRows = useMemo(
    () => (source ? computeCdf(source, range).length : 0),
    [source, range],
  );
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>
        Raw vega repro — no toolkit
      </h1>
      <p
        style={{ fontSize: 12, color: "#6b6b66", marginTop: 0, maxWidth: 840 }}
      >
        The captured Vega-Lite spec, replayed through vega-embed with one
        changeset per change and the brush wired back to the data. No Vue, no
        custom element, no Pinia, no UDIVis. Drag the slider or brush in the
        chart; if a curve stops matching its rows, press{" "}
        <strong>Re-embed</strong> — if the picture changes while the row count
        does not, the bug lives below the toolkit.
      </p>
      <p
        style={{
          fontSize: 11,
          color: verdict.startsWith("matches") ? "#2b8b6c" : "#b3261e",
        }}
      >
        plain-JS pipeline {verdict}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "8px 0",
        }}
      >
        <RangeSlider
          label="body_mass_g"
          min={DOMAIN[0]}
          max={DOMAIN[1]}
          value={range}
          onChange={setRange}
          onClear={() => setRange(null)}
        />
        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {computedRows} rows computed · {drawn ?? "…"} in view
        </span>
        <button
          onClick={() => setEmbedKey((n) => n + 1)}
          style={{ fontSize: 11, padding: "4px 10px" }}
        >
          ⟳ Re-embed
        </button>
      </div>
      <div
        style={{
          width: 560,
          height: 280,
          border: "1px solid #e3e3e0",
          background: "#fff",
        }}
      >
        <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}

// Cache the root across hot updates; calling createRoot twice on one container
// is a dev-only warning, but noise in a harness meant to be read by strangers.
const container = document.getElementById("root")!;
const g = globalThis as { __rawRoot?: ReturnType<typeof createRoot> };
g.__rawRoot ??= createRoot(container);
g.__rawRoot.render(<App />);
