const pad = (n: number) => String(n).padStart(2, '0');

/** An epoch-ms date as an `<input type="date">` value (`YYYY-MM-DD`, local). */
export function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** An `<input type="date">` value as epoch ms: the start of that local day, or
 *  its last millisecond for an inclusive upper bound. `null` while the input
 *  holds no complete date. `valueAsNumber` won't do — it's UTC midnight. */
export function fromDateInputValue(value: string, endOfDay: boolean): number | null {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    : new Date(y, m - 1, d).getTime();
}
