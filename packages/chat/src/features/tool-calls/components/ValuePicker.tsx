import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { highlightMatch } from '@/utils/highlightMatch';

interface ValuePickerProps {
  options: string[];
  selected: readonly string[];
  onToggle: (value: string, checked: boolean) => void;
  /** Namespaces checkbox ids so two pickers can coexist in one bubble. */
  idPrefix: string;
  /** Show the search box once there are more than this many options. */
  filterThreshold?: number;
}

/**
 * A scrollable checkbox list of a categorical field's values, with a search box
 * once the list outgrows a glance. Field domains are uncapped — an id-like
 * column carries one value per row — so the search is what keeps the widget
 * usable past a few dozen options.
 */
export function ValuePicker({
  options,
  selected,
  onToggle,
  idPrefix,
  filterThreshold = 12,
}: ValuePickerProps) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const visible = useMemo(() => {
    if (!trimmed) return options;
    const q = trimmed.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, trimmed]);

  return (
    <div className="udi:space-y-1.5">
      {options.length > filterThreshold && (
        <div className="udi:relative">
          <Search className="udi:pointer-events-none udi:absolute udi:top-1/2 udi:left-2 udi:h-3 udi:w-3 udi:-translate-y-1/2 udi:text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter values..."
            className="udi:h-7 udi:pl-7 udi:text-xs"
          />
        </div>
      )}
      <ScrollArea scrollShadow viewportClassName="udi:max-h-48">
        <div className="udi:space-y-1.5">
          {visible.map((value, i) => {
            // Index, not the value: real domain values contain spaces and
            // punctuation, which make an invalid id and silently break the
            // label/control association (and with it the accessible name).
            const id = `${idPrefix}-${i}`;
            return (
              <div key={value} className="udi:flex udi:items-center udi:gap-2">
                <Checkbox
                  id={id}
                  checked={selected.includes(value)}
                  onCheckedChange={(checked) => onToggle(value, !!checked)}
                />
                <Label htmlFor={id} className="udi:cursor-pointer udi:text-xs">
                  {highlightMatch(value, trimmed)}
                </Label>
              </div>
            );
          })}
          {visible.length === 0 && (
            <span className="udi:text-xs udi:text-muted-foreground">
              No values match {`"${query}"`}.
            </span>
          )}
        </div>
      </ScrollArea>
      {trimmed && visible.length > 0 && (
        <span className="udi:text-[10px] udi:text-muted-foreground">
          {visible.length} of {options.length} shown
        </span>
      )}
    </div>
  );
}
