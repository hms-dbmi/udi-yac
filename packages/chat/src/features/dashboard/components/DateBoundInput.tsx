import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInput';

/**
 * One bound of a date range, edited as a calendar date. `value`, `min`, `max`
 * and the committed bound are epoch ms; the upper bound (`endOfDay`) takes in
 * its whole last day.
 *
 * Like StepNumberInput, the text is a draft until Enter or blur. A date input
 * reports every keystroke of a year as a complete date — typing 2024 passes
 * through 0002, 0020 and 0202 — and with no `inputType` to tell typing from a
 * picker choice, so committing on change clamped the bound to the range before
 * the year was finished. A date picked from the calendar applies on blur too.
 */
export function DateBoundInput({
  value,
  min,
  max,
  endOfDay,
  disabled,
  label,
  className,
  onCommit,
}: {
  value: number;
  min?: number | undefined;
  max?: number | undefined;
  endOfDay: boolean;
  disabled: boolean;
  label: string;
  className?: string;
  onCommit: (ms: number) => void;
}) {
  const shown = toDateInputValue(value);
  const [text, setText] = useState(shown);
  // Re-synced from the prop only while there's no unfinished edit, as in
  // StepNumberInput: a brush moving the range updates the box, and doesn't
  // overwrite a date being typed.
  const [dirty, setDirty] = useState(false);
  const [syncedTo, setSyncedTo] = useState(shown);
  if (!dirty && syncedTo !== shown) {
    setSyncedTo(shown);
    setText(shown);
  }
  // Escape blurs the field, and the blur that follows must not commit what
  // Escape just discarded.
  const cancelled = useRef(false);

  const commit = () => {
    setDirty(false);
    const ms = fromDateInputValue(text, endOfDay);
    // An incomplete date, or one left as it was, keeps the bound where it is.
    if (ms !== null && text !== shown) onCommit(ms);
    // Show what was kept; when the caller moves the value, the re-sync above
    // replaces this.
    setText(shown);
  };

  return (
    <Input
      type="date"
      aria-label={label}
      disabled={disabled}
      className={cn('udi:h-7 udi:w-36 udi:px-1.5 udi:text-sm udi:font-semibold', className)}
      value={text}
      min={min != null ? toDateInputValue(min) : undefined}
      max={max != null ? toDateInputValue(max) : undefined}
      onChange={(e) => {
        setText(e.target.value);
        setDirty(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          cancelled.current = true;
          setDirty(false);
          setText(shown);
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (cancelled.current) {
          cancelled.current = false;
          setText(shown);
          return;
        }
        commit();
      }}
    />
  );
}
