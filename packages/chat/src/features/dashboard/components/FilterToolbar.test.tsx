/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FilterChips } from './FilterToolbar';

afterEach(cleanup);

const chips = [
  {
    id: 'a',
    dataSourceKey: 'Event',
    type: 'point',
    label: 'Event Type',
    value: 'Initial CNS Tumor',
  },
  { id: 'b', dataSourceKey: 'Treatment Summary', type: 'interval', label: 'Age', value: '0–5807' },
];

describe('FilterChips', () => {
  it('names each clear button for its own filter', async () => {
    const onClear = vi.fn();
    render(
      <TooltipProvider>
        <FilterChips chips={chips} onClear={onClear} />
      </TooltipProvider>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Clear filter Event Type: Initial CNS Tumor' }),
    );

    expect(onClear).toHaveBeenCalledWith('a');
    expect(screen.getByRole('button', { name: 'Clear filter Age: 0–5807' })).toBeTruthy();
  });
});
