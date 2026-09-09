import { useCallback, useMemo, useRef, useState } from 'react';

interface CutPointHistogramProps {
  /** Bin counts across [min, max], left to right. Empty renders the axis alone. */
  bins: number[];
  min: number;
  max: number;
  cuts: number[];
  /** Fires continuously while dragging, and once on a click-to-add. */
  onChange: (cuts: number[]) => void;
  /** Fires when a drag ends, so the caller can re-bind once rather than per pixel. */
  onCommit: (cuts: number[]) => void;
  disabled?: boolean;
}

const HEIGHT = 72;
const HANDLE_HIT = 10;

/**
 * The distribution of the stratifier, with a draggable divider per cut point.
 *
 * Choosing a threshold is a judgement about the data, so the control shows the
 * data: a histogram says where the mass actually is, and whether a cut at 65
 * separates two populations or slices through the middle of one. A bare pair of
 * number inputs cannot answer that, which is why this exists rather than just
 * the list beside it.
 *
 * Pointer events rather than drag-and-drop: this has to work with a mouse, a
 * trackpad and a touchscreen, and `setPointerCapture` keeps a drag alive when
 * the pointer leaves the plot — which it will, because the interesting cut is
 * often at the very edge of the range. Each handle also carries a real
 * `<input type="range">` sibling in the parent list, so the whole control is
 * reachable and adjustable from the keyboard without reimplementing arrow keys
 * here.
 */
export function CutPointHistogram({
  bins,
  min,
  max,
  cuts,
  onChange,
  onCommit,
  disabled = false,
}: CutPointHistogramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const span = max - min;
  const peak = useMemo(() => bins.reduce((a, b) => Math.max(a, b), 0), [bins]);

  const toPercent = useCallback(
    (value: number) => (span > 0 ? ((value - min) / span) * 100 : 0),
    [min, span],
  );

  const valueAt = useCallback(
    (clientX: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || span <= 0) return min;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return min + ratio * span;
    },
    [min, span],
  );

  const handlePointerDown = useCallback(
    (index: number) => (event: React.PointerEvent) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      setDragging(index);
    },
    [disabled],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (dragging === null) return;
      // Not re-sorted mid-drag: reordering under the pointer would swap which
      // handle is being held and send it flying to the other cut's position.
      const next = [...cuts];
      next[dragging] = Number(valueAt(event.clientX).toFixed(4));
      onChange(next);
    },
    [cuts, dragging, onChange, valueAt],
  );

  const endDrag = useCallback(() => {
    if (dragging === null) return;
    setDragging(null);
    onCommit([...cuts].sort((a, b) => a - b));
  }, [cuts, dragging, onCommit]);

  // Clicking empty plot adds a cut there — the fastest way to a first split,
  // and it means the control is useful before any handle exists to drag.
  const handleBackgroundClick = useCallback(
    (event: React.MouseEvent) => {
      if (disabled || dragging !== null) return;
      const value = Number(valueAt(event.clientX).toFixed(4));
      if (cuts.some((c) => Math.abs(toPercent(c) - toPercent(value)) < 2)) return;
      const next = [...cuts, value].sort((a, b) => a - b);
      onChange(next);
      onCommit(next);
    },
    [cuts, disabled, dragging, onChange, onCommit, toPercent, valueAt],
  );

  return (
    <div className="select-none">
      <svg
        ref={svgRef}
        role="presentation"
        className={`w-full ${disabled ? 'opacity-50' : 'cursor-copy'}`}
        height={HEIGHT}
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        onClick={handleBackgroundClick}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Bars. Drawn in a 0–100 user space and stretched, so they always span
            the popover's width whatever it happens to be. */}
        {bins.map((count, i) => {
          const barHeight = peak > 0 ? (count / peak) * (HEIGHT - 8) : 0;
          return (
            <rect
              key={i}
              x={(i / bins.length) * 100}
              y={HEIGHT - barHeight}
              width={100 / bins.length}
              height={barHeight}
              className="fill-muted-foreground/30"
            />
          );
        })}

        <line
          x1={0}
          y1={HEIGHT}
          x2={100}
          y2={HEIGHT}
          className="stroke-border"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {cuts.map((cut, index) => {
          const x = toPercent(cut);
          return (
            <g key={index}>
              <line
                x1={x}
                y1={0}
                x2={x}
                y2={HEIGHT}
                className="stroke-primary"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              {/* A wide invisible strip over the hairline: 2px is precise to
                  look at and impossible to grab. */}
              <rect
                x={x - HANDLE_HIT / 2}
                y={0}
                width={HANDLE_HIT}
                height={HEIGHT}
                fill="transparent"
                className={disabled ? '' : 'cursor-ew-resize'}
                onPointerDown={handlePointerDown(index)}
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{formatBound(min)}</span>
        <span>{formatBound(max)}</span>
      </div>
    </div>
  );
}

function formatBound(value: number): string {
  if (!isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
