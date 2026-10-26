import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A number you can type into, shown and stepped at `precision` decimals: a
 * stratifier's cut point, a range filter's bound. `cutPrecision` picks the
 * precision from the field's range, so a field spanning thousands (age in days)
 * reads and steps in whole numbers.
 *
 * The text is held locally and only reported when the edit is finished, because
 * the cut list is kept sorted: reporting each keystroke meant that typing `1000`
 * into the upper of two cuts sent `1` through `moveCut` first, which re-sorted
 * the list and moved a *different* cut under the caret. The field then showed
 * its neighbour's value and the rest of the edit landed on the wrong cut. A
 * range's bounds have the same problem, since a bound can't pass the other.
 *
 * Re-syncing from the prop only while unfocused is what makes that safe: a
 * commit that reorders the list updates every other field, and leaves the one
 * being typed in alone.
 */
export function StepNumberInput({
  value,
  precision,
  disabled,
  label,
  className,
  onCommit,
}: {
  value: number;
  precision: number;
  disabled: boolean;
  label: string;
  className?: string;
  onCommit: (value: number) => void;
}) {
  // A value the caller holds at full precision (a brush's edge, a field's
  // extent) still reads at the field's.
  const shown = (v: number) => String(Number(v.toFixed(precision)));
  const [text, setText] = useState(() => shown(value));
  // "The user has typed something here that they have not finished", NOT "this
  // field has focus". Base UI moves focus into the popup when it opens, and
  // this is the first focusable thing in it — so gating on focus meant the
  // field was considered mid-edit from the moment the popover opened, and a
  // cut dragged on the histogram never reached the box beside it.
  const [dirty, setDirty] = useState(false);
  const [syncedTo, setSyncedTo] = useState(value);
  if (!dirty && syncedTo !== value) {
    setSyncedTo(value);
    setText(shown(value));
  }
  // Escape blurs the field, and the blur that follows must not commit what
  // Escape just discarded. A ref rather than state because the blur handler
  // runs before a state update from the keydown would reach it.
  const cancelled = useRef(false);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || !isFinite(parsed)) {
      setText(shown(value)); // unparseable: keep the cut where it was
      return;
    }
    // Tabbing through an untouched field should not re-bind the chart.
    if (Number(parsed.toFixed(precision)) === Number(value.toFixed(precision))) {
      setText(shown(value));
      return;
    }
    onCommit(parsed);
    // Show what was kept. When the caller moves the value, the re-sync above
    // replaces this; when it doesn't (a step past the end, clamped back), the
    // box would otherwise keep showing the number it refused.
    setText(shown(value));
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
      // Not a credential: keep browsers and password managers from offering to fill it.
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      data-bwignore
      data-form-type="other"
      className={cn('udi:h-6 udi:text-xs', className)}
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
          setText(shown(value));
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        setDirty(false);
        if (cancelled.current) {
          cancelled.current = false;
          setText(shown(value));
          return;
        }
        commit(text);
      }}
    />
  );
}
