/**
 * A two-handle range over one quantitative field.
 *
 * Two native `<input type="range">`s over a drawn track. The styling in
 * `index.css` is not cosmetic: without it the lower input's filled track paints
 * across the full width whatever the handles say, and the upper input swallows
 * every pointer event so its handle cannot be grabbed.
 */
export function RangeSlider({
  label,
  min,
  max,
  value,
  onChange,
  onClear,
}: {
  label: string;
  min: number;
  max: number;
  value: [number, number] | null;
  onChange: (next: [number, number]) => void;
  onClear: () => void;
}) {
  const [lo, hi] = value ?? [min, max];
  const span = max - min || 1;
  const step = Math.max(1, Math.round(span / 200));
  const pct = (v: number) => ((v - min) / span) * 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
      <span style={{ minWidth: 92 }}>{label}</span>
      <div className="range">
        <div className="range__track" />
        <div className="range__fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input
          type="range"
          aria-label={`${label} minimum`}
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
        />
        <input
          type="range"
          aria-label={`${label} maximum`}
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
        />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 110 }}>
        {value ? `${Math.round(lo)} – ${Math.round(hi)}` : 'all'}
      </span>
      <button onClick={onClear} disabled={!value} style={{ fontSize: 11, padding: '2px 8px' }}>
        clear
      </button>
    </div>
  );
}
