import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadDataPackage,
  type DataFieldDomain,
  type DataSelections,
  type IntervalDomain,
  type UDIGrammar,
} from 'udi-toolkit/react';
import { Chart } from './Chart';
import { RangeSlider } from './RangeSlider';
import specs from './specs.json';

/**
 * A minimal reproduction of hms-dbmi/udi-yac#34, outside the YAC app.
 *
 * Nothing here is generated: the specs in `specs.json` are baked output, three
 * instantiated straight from the agent's own templates and one hand-built to
 * mirror the stratified survival stack. There is no agent, no chat, no dashboard
 * store and no spec rewriting — just one static spec at a time, the toolkit, and
 * a filter wired the way YAC wires one.
 *
 * YAC's wiring, reproduced exactly:
 *   - a named filter transform prepended to the spec
 *     (`{ filter: { name }, in, out }` — see `dashboardStore.getNamedFilters`)
 *   - the selection passed down the `selections` prop of `UDIVis`, which binds
 *     it into the toolkit's shared Pinia store, where the Arquero executor
 *     resolves the named filter against it
 */

/** Must match the injected `select.name`: the brush inside the chart and the
 *  slider above it are two views of one selection. */
const MASS_FILTER = 'mass-filter';
const MASS_FIELD = 'body_mass_g';
const ENTITY = 'penguins';
/** One CSV, named the way the specs refer to it. No datapackage indirection. */
const SOURCES = [{ name: ENTITY, url: './data/penguins/penguins.csv' }];

type SpecName = keyof typeof specs;
const SPEC_LABELS: Record<SpecName, string> = {
  survivalShaped: 'Survival-shaped (5 layers, colour facet)',
  cdfGrouped: 'CDF grouped by species (template 50)',
  kdeGrouped: 'KDE grouped by species (template 72)',
  cdfPlain: 'CDF, no grouping (template 49)',
};

/**
 * Put the interval brush on the layer that actually plots the filtered field.
 *
 * The brushed layer's x encoding decides what the selection is keyed by, so it
 * has to be the layer whose x is `body_mass_g` — on the survival-shaped spec the
 * first layer plots a lead-in column that is null nearly everywhere, and
 * brushing that would produce a selection on the wrong field.
 */
function withBrush(spec: UDIGrammar): UDIGrammar {
  const select = { name: MASS_FILTER, how: { type: 'interval', on: 'x' } };
  const rep = (spec as { representation?: unknown }).representation;
  const plotsMass = (layer: unknown) => {
    const mapping = (layer as { mapping?: unknown }).mapping;
    const entries = Array.isArray(mapping) ? mapping : [mapping];
    return entries.some(
      (m) =>
        (m as { encoding?: string })?.encoding === 'x' &&
        (m as { field?: string })?.field === MASS_FIELD,
    );
  };
  if (!Array.isArray(rep)) {
    return {
      ...spec,
      representation: { ...(rep as object), select },
    } as UDIGrammar;
  }
  const target = rep.findIndex(plotsMass);
  const index = target === -1 ? 0 : target;
  return {
    ...spec,
    representation: rep.map((layer, i) => (i === index ? { ...(layer as object), select } : layer)),
  } as UDIGrammar;
}

/** Prepend the named filter, exactly as `getNamedFilters` does in chat — including
 *  on the chart that owns the brush, since chat puts a viz's own brush id in its
 *  own filter list too. */
function withFilter(spec: UDIGrammar): UDIGrammar {
  const base = (spec as { transformation?: unknown[] }).transformation ?? [];
  return {
    ...spec,
    transformation: [{ filter: { name: MASS_FILTER }, in: ENTITY, out: ENTITY }, ...base],
  } as UDIGrammar;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [massRange, setMassRange] = useState<[number, number] | null>(null);
  const [massDomain, setMassDomain] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<SpecName>('cdfGrouped');
  // Bumping this remounts the chart, which re-embeds the Vega view — the same
  // thing toggling to table view and back does in YAC, and the only known way to
  // clear a stale frame. A button for it makes the bug easy to see: leave a bad
  // frame on screen, press it, watch the picture change without the data changing.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadDataPackage(SOURCES, {
      // The slider's bounds come from the toolkit's own domain computation
      // rather than from a hardcoded guess.
      onEntityDomains: (_entity: string, domains: DataFieldDomain[]) => {
        const d = domains.find((x) => x.field === MASS_FIELD);
        if (d?.type === 'interval') {
          const iv = d.domain as IntervalDomain;
          setMassDomain([iv.min, iv.max]);
        }
      },
    })
      .then(() => setReady(true))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  // The point of the repro: the spec objects are built once and never change.
  // Only the selection does, so nothing that goes wrong can be spec generation.
  const specsWithFilter = useMemo(() => {
    const out = {} as Record<SpecName, UDIGrammar>;
    for (const name of Object.keys(specs) as SpecName[]) {
      out[name] = withBrush(withFilter(specs[name] as unknown as UDIGrammar));
    }
    return out;
  }, []);

  // The key is ALWAYS present; `selection: null` is how a filter is turned off.
  // Omitting it does not clear it: `bindExternalDataSelections` iterates only the
  // keys it is given, so a key that disappears leaves the store's previous value
  // in place — the filter would apply once and then never lift.
  const selections = useMemo<DataSelections>(
    () => ({
      [MASS_FILTER]: {
        dataSourceKey: ENTITY,
        type: 'interval',
        selection: massRange ? { [MASS_FIELD]: massRange } : null,
      },
    }),
    [massRange],
  );

  // The brush half of the binding: a drag inside the chart reports the whole
  // store, from which we read this one selection back into the slider.
  const handleBrush = useCallback((next: DataSelections) => {
    const range = next[MASS_FILTER]?.selection?.[MASS_FIELD] as [number, number] | undefined;
    setMassRange((prev) => {
      if (!range) return prev === null ? prev : null;
      if (prev && prev[0] === range[0] && prev[1] === range[1]) return prev;
      return [range[0], range[1]];
    });
  }, []);

  if (error) return <pre style={{ padding: 16, color: '#b3261e' }}>{error}</pre>;
  if (!ready) return <p style={{ padding: 16 }}>Loading penguins…</p>;

  return (
    <div style={{ padding: 16 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 16,
          marginBottom: 4,
        }}
      >
        <h1 style={{ fontSize: 18, margin: 0 }}>Stale-render repro — udi-yac#34</h1>
        <select
          aria-label="chart"
          value={selected}
          onChange={(e) => setSelected(e.target.value as SpecName)}
          style={{ fontSize: 12, padding: '4px 6px' }}
        >
          {(Object.keys(SPEC_LABELS) as SpecName[]).map((name) => (
            <option key={name} value={name}>
              {SPEC_LABELS[name]}
            </option>
          ))}
        </select>

        <button
          onClick={() => setRefreshKey((n) => n + 1)}
          title="Remount the chart, which re-embeds the Vega view"
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #b9b9b4',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          ⟳ Re-embed
        </button>
      </header>
      {massDomain && (
        <div style={{ margin: '8px 0 4px' }}>
          <RangeSlider
            label={MASS_FIELD}
            min={massDomain[0]}
            max={massDomain[1]}
            value={massRange}
            onChange={setMassRange}
            onClear={() => setMassRange(null)}
          />
        </div>
      )}
      <p style={{ fontSize: 12, color: '#6b6b66', marginTop: 0, maxWidth: 820 }}>
        Static spec, no agent. The slider and the chart's own brush are two views of one interval
        selection, which a named filter in the spec resolves against — the same path a YAC filter
        takes. Drag until a curve stops matching its data, then press <strong>Re-embed</strong>: the
        picture changes while the row count does not. That gap is the bug.
      </p>
      {/* One chart at a time: fewer views sharing the store is a smaller surface.
          Remounting on either the chart choice or the re-embed button gives a
          clean Vega view, which is the only known way to clear a stale frame. */}
      <Chart
        key={`${selected}-${refreshKey}`}
        title={SPEC_LABELS[selected]}
        spec={specsWithFilter[selected]}
        selections={selections}
        onSelectionChange={handleBrush}
      />
    </div>
  );
}
