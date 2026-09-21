import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import embed, { type Result } from 'vega-embed';
import { changeset, type View } from 'vega';
import vegaSpec from './vega-spec.json';
import frames from './raw-frames.json';
import { computeCdf, verifyAgainstFrames, type Row } from './cdf';
import { RangeSlider } from './RangeSlider';
import './index.css';

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

const SIGNAL = 'mass_filter';

// TEMP (#34): the same call tap the toolkit build carries, so the two call
// sequences can be diffed rather than reasoned about.
let callSeq = 0;
function tapView(v: Record<string, unknown>, tag: string): void {
  for (const name of ['change', 'signal', 'resize', 'runAsync', 'run']) {
    const orig = (v[name] as (...a: unknown[]) => unknown).bind(v);
    v[name] = (...args: unknown[]) => {
      const id = ++callSeq;
      const detail =
        name === 'change' ? String(args[0]) : name === 'signal' ? `${String(args[0])}=set` : '';
      if (name !== 'signal' || args.length > 1) {
        console.warn(`VCALL ${tag} #${id} ${name} ${detail}`);
      }
      const out = orig(...args);
      if (out && typeof (out as Promise<unknown>).then === 'function') {
        void (out as Promise<unknown>).then(() => console.warn(`VCALL ${tag} #${id} ${name} done`));
      }
      return out;
    };
  }
} // vega sanitises the param name's dash
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
  const [source, setSource] = useState<{ species: string; body_mass_g: number }[] | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [embedKey, setEmbedKey] = useState(0);
  const [drawn, setDrawn] = useState<number | null>(null);
  const [verdict, setVerdict] = useState('checking…');
  // Narrowing the delta to the toolkit, step 1: the toolkit's updates overlap —
  // a drag fires them from a Vue watcher without awaiting the previous run —
  // while this page awaited each one. Awaiting is the safer shape, so a bug that
  // needs concurrency could never have shown here.
  const [awaitEach, setAwaitEach] = useState(false);
  const [stressing, setStressing] = useState(false);
  // The toolkit re-asserts the selection after EVERY update — `updateVegaChart`
  // ends by calling `updateVegaChartSelections`, which writes the brush signals
  // and runs the view a second time — including while the user is dragging that
  // very brush. This page normally skips the write-back when the change came
  // from the brush, precisely so a drag does not fight itself. Turning this on
  // reproduces the toolkit's shape.
  const [reassert, setReassert] = useState(false);
  // Both pages now use the identical captured spec, so only two differences in
  // what reaches Vega remain: the toolkit inserts every column of the source row
  // (nine, not the four the encodings read), and it embeds with a `config`
  // carrying the palette ranges.
  const [wideRows, setWideRows] = useState(false);
  const [withConfig, setWithConfig] = useState(false);
  const stressingRef = useRef(false);
  const wideRowsRef = useRef(false);
  wideRowsRef.current = wideRows;

  useEffect(() => {
    void fetch('./data/penguins/penguins.csv')
      .then((r) => r.text())
      .then((text) => {
        const [head, ...lines] = text.trim().split('\n');
        const cols = head.split(',');
        const si = cols.indexOf('species');
        const mi = cols.indexOf('body_mass_g');
        const rows = lines
          .map((l) => l.split(','))
          .map((c) => ({ species: c[si], body_mass_g: Number(c[mi]) }))
          .filter((r) => Number.isFinite(r.body_mass_g));
        setSource(rows);
        setVerdict(verifyAgainstFrames(rows, frames as unknown as Frame[]));
      });
  }, []);

  const applyRows = useCallback(async (view: View, rows: Row[]) => {
    const payload = rows.map((r) =>
      wideRowsRef.current
        ? {
            ...r,
            // Filler for the columns the executor carries through but no
            // encoding reads — the toolkit inserts nine, this page four.
            island: 'Biscoe',
            bill_length_mm: 0,
            bill_depth_mm: 0,
            flipper_length_mm: 0,
            sex: 'male',
          }
        : { ...r },
    );
    view.change(
      'udi_data',
      changeset()
        .remove(() => true)
        .insert(payload),
    );
    await view.resize().runAsync();
    setDrawn((view.data('udi_data') as unknown[] | undefined)?.length ?? 0);

    // The same scenegraph measurement the toolkit build is instrumented with, so
    // the control is judged by the same instrument rather than by eye. One stale
    // point per facet group is easy to miss visually and is exactly the symptom.
    try {
      const v = view as unknown as {
        data: (n: string) => unknown[];
        scenegraph: () => { root: unknown };
      };
      const found: number[] = [];
      const walk = (node: unknown, chrome: boolean) => {
        const n = node as {
          marktype?: string;
          name?: string;
          role?: string;
          items?: unknown[];
        };
        if (!n || typeof n !== 'object') return;
        const isChrome = chrome || n.role === 'axis' || n.role === 'legend';
        if (!isChrome && n.marktype && n.marktype !== 'group' && Array.isArray(n.items)) {
          if ((n.name ?? '').endsWith('marks')) found.push(n.items.length);
        }
        for (const c of (n.items ?? []) as unknown[]) walk(c, isChrome);
      };
      walk(v.scenegraph().root, false);
      const base = v.data('udi_data')?.length ?? 0;
      const sum = found.reduce((a, b) => a + b, 0);
      console.warn(
        `RAWSCENE udi_data=${base} marks=[${found.join(',')}] sum=${sum} diff=${sum - base}`,
      );
    } catch (e) {
      console.warn('RAWSCENE probe failed', String(e).slice(0, 120));
    }
  }, []);

  // Embed once per re-embed, with no rows — as initVegaChart does.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !source) return;
    let cancelled = false;
    const spec = JSON.parse(JSON.stringify(vegaSpec)) as Record<string, unknown>;
    delete (spec.data as { values?: unknown }).values;
    const config = withConfig
      ? {
          point: { shape: 'circle', filled: true },
          mark: { color: '#E6A01A' },
          range: {
            category: [
              '#E6A01A',
              '#16A987',
              '#0673B0',
              '#9EC8DD',
              '#204E62',
              '#BF97E4',
              '#D95838',
              '#6FDCC3',
              '#787874',
            ],
            ordinal: { scheme: 'teals' },
            ramp: { scheme: 'oranges' },
          },
        }
      : undefined;
    void embed(host, spec as never, {
      actions: true,
      ...(config ? { config } : {}),
    }).then((result) => {
      if (cancelled) {
        result.view.finalize();
        return;
      }
      resultRef.current = result;
      viewRef.current = result.view;
      tapView(result.view as unknown as Record<string, unknown>, 'CONTROL');
      // Brush -> data. Pixel signal in, data range out, exactly as VegaLite.vue
      // does with fromPixelRange.
      result.view.addSignalListener(`${SIGNAL}_x`, (_n, value) => {
        if (syncing.current) return; // our own write, not the user's drag
        const px = value as [number, number] | null;
        if (!Array.isArray(px) || px.length !== 2 || px[0] === px[1]) return;
        const scale = result.view.scale('x');
        const a = scale.invert(px[0]) as number;
        const b = scale.invert(px[1]) as number;
        const next: [number, number] = [Math.round(Math.min(a, b)), Math.round(Math.max(a, b))];
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
  }, [embedKey, source, withConfig]);

  /**
   * Sweep the range the way a drag does: one step per animation frame, each
   * firing a changeset and a run without waiting for the previous to settle.
   * That concurrency is the one property `/` has and this page lacked.
   */
  const stressDrag = useCallback(() => {
    const view = viewRef.current;
    if (!view || !source || stressingRef.current) return;
    stressingRef.current = true;
    setStressing(true);
    const STEPS = 48;
    let i = 0;
    const finish = (lo: number) => {
      stressingRef.current = false;
      setStressing(false);
      rangeRef.current = [lo, DOMAIN[1]];
      setRange([lo, DOMAIN[1]]);
      void view.runAsync().then(() => {
        setDrawn((view.data('udi_data') as unknown[] | undefined)?.length ?? 0);
      });
    };
    const tick = () => {
      if (!viewRef.current) return;
      // Out and back, so the row count both shrinks and grows.
      const t = i <= STEPS / 2 ? i / (STEPS / 2) : 2 - i / (STEPS / 2);
      const lo = Math.round(DOMAIN[0] + (DOMAIN[1] - DOMAIN[0]) * 0.55 * t);
      const rows = computeCdf(source, [lo, DOMAIN[1]]);
      view.change(
        'udi_data',
        changeset()
          .remove(() => true)
          .insert(rows.map((r) => ({ ...r }))),
      );
      const run = view.resize().runAsync();
      i += 1;
      if (awaitEach) {
        void run.then(() => (i <= STEPS ? requestAnimationFrame(tick) : finish(lo)));
        return;
      }
      void run; // deliberately not awaited: let the runs overlap
      if (i <= STEPS) requestAnimationFrame(tick);
      else finish(lo);
    };
    requestAnimationFrame(tick);
  }, [source, awaitEach]);

  // Range -> data, and (only when the range did not come from the brush)
  // range -> brush rect.
  useEffect(() => {
    rangeRef.current = range;
    const view = viewRef.current;
    if (!view || !source || stressingRef.current) return;
    const cameFromBrush = fromBrush.current;
    fromBrush.current = false;
    void applyRows(view, computeCdf(source, range)).then(() => {
      if (cameFromBrush && !reassert) return; // the rect is already where the user put it
      syncing.current = true;
      const scale = view.scale('x');
      if (range) view.signal(`${SIGNAL}_x`, [scale(range[0]), scale(range[1])]);
      else view.signal(`${SIGNAL}_x`, null);
      void view.runAsync().finally(() => {
        syncing.current = false;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, source, reassert]);

  const computedRows = useMemo(
    () => (source ? computeCdf(source, range).length : 0),
    [source, range],
  );
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Raw vega repro — no toolkit</h1>
      <p style={{ fontSize: 12, color: '#6b6b66', marginTop: 0, maxWidth: 840 }}>
        The captured Vega-Lite spec, replayed through vega-embed with one changeset per change and
        the brush wired back to the data. No Vue, no custom element, no Pinia, no UDIVis. Drag the
        slider or brush in the chart; if a curve stops matching its rows, press{' '}
        <strong>Re-embed</strong> — if the picture changes while the row count does not, the bug
        lives below the toolkit.
      </p>
      <p
        style={{
          fontSize: 11,
          color: verdict.startsWith('matches') ? '#2b8b6c' : '#b3261e',
        }}
      >
        plain-JS pipeline {verdict}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '8px 0',
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
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          {computedRows} rows computed · {drawn ?? '…'} in view
        </span>
        <button
          onClick={() => setEmbedKey((n) => n + 1)}
          style={{ fontSize: 11, padding: '4px 10px' }}
        >
          ⟳ Re-embed
        </button>
        <button
          onClick={stressDrag}
          disabled={stressing}
          title="Sweep the range one step per frame, without awaiting each run"
          style={{ fontSize: 11, padding: '4px 10px' }}
        >
          {stressing ? 'sweeping…' : '⇄ Stress drag'}
        </button>
        <label style={{ fontSize: 11 }}>
          <input
            type="checkbox"
            checked={awaitEach}
            onChange={(e) => setAwaitEach(e.target.checked)}
          />{' '}
          await each run
        </label>
        <label style={{ fontSize: 11 }}>
          <input
            type="checkbox"
            checked={reassert}
            onChange={(e) => setReassert(e.target.checked)}
          />{' '}
          re-assert selection (as toolkit does)
        </label>
        <label style={{ fontSize: 11 }}>
          <input
            type="checkbox"
            checked={wideRows}
            onChange={(e) => setWideRows(e.target.checked)}
          />{' '}
          wide rows
        </label>
        <label style={{ fontSize: 11 }}>
          <input
            type="checkbox"
            checked={withConfig}
            onChange={(e) => setWithConfig(e.target.checked)}
          />{' '}
          vega config
        </label>
      </div>
      <div
        style={{
          width: 560,
          height: 280,
          border: '1px solid #e3e3e0',
          background: '#fff',
        }}
      >
        <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

// Cache the root across hot updates; calling createRoot twice on one container
// is a dev-only warning, but noise in a harness meant to be read by strangers.
const container = document.getElementById('root')!;
const g = globalThis as { __rawRoot?: ReturnType<typeof createRoot> };
g.__rawRoot ??= createRoot(container);
g.__rawRoot.render(<App />);
