/**
 * @vitest-environment jsdom
 *
 * The Filters bar: each chip opens a popover holding its filter's controls,
 * with the entity/field fixed (shown as text), a "Clear all" that keeps the
 * filter in place (its chip reads "All"), and a "Remove filter" that takes the
 * chip away.
 */
import { describe, it, expect } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import {
  UDIChatProvider,
  useDataFiltersStore,
  useDataPackage,
  useDataPackageStore,
} from '@/app/UDIChatContext';
import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';
import type { StoreApi } from 'zustand/vanilla';
import type { DataFiltersState } from '../stores/dataFiltersStore';
import { FilterToolbar } from './FilterToolbar';
import { FilterControls } from './FilterControls';

const pkg = {
  'udi:path': 'data',
  resources: [
    {
      name: 'datasets',
      path: 'datasets.csv',
      schema: {
        fields: [
          { name: 'assay_type', 'udi:data_type': 'nominal' },
          { name: 'file_size', 'udi:data_type': 'quantitative' },
        ],
      },
    },
  ],
} as unknown as DataPackage;

const domains: DataFieldDomain[] = [
  {
    entity: 'datasets',
    field: 'assay_type',
    type: 'point',
    fieldDescription: '',
    domain: { values: ['AF', 'CODEX', 'MIBI'] },
  },
  {
    entity: 'datasets',
    field: 'file_size',
    type: 'interval',
    fieldDescription: '',
    domain: { min: 0, max: 100 },
  },
];

let filters: StoreApi<DataFiltersState>;

function Harness({ children }: { children: ReactNode }) {
  const dataPackageStore = useDataPackageStore();
  const dataFiltersStore = useDataFiltersStore();
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  useEffect(() => {
    filters = dataFiltersStore;
    dataPackageStore.setState({
      dataPackage: pkg,
      dataFieldDomains: domains,
      sourceFields: { datasets: ['assay_type', 'file_size'] },
      categoricalSourceFields: { datasets: ['assay_type'] },
      quantitativeSourceFields: { datasets: ['file_size'] },
      entityNames: ['datasets'],
      loadingPhase: 'ready',
    });
    const store = dataFiltersStore.getState();
    store.setDataSelection('message-filter-0-0', {
      dataSourceKey: 'datasets',
      type: 'point',
      selection: { assay_type: ['CODEX', 'MIBI'] },
    });
    store.setDataSelection('message-filter-1-0', {
      dataSourceKey: 'datasets',
      type: 'interval',
      selection: { file_size: [10, 50] },
    });
  }, [dataPackageStore, dataFiltersStore]);
  return loadingPhase === 'ready' ? <>{children}</> : null;
}

function renderToolbar({
  readOnly = false,
  children,
}: { readOnly?: boolean; children?: ReactNode } = {}) {
  return render(
    <UDIChatProvider readOnly={readOnly}>
      <Harness>
        <FilterToolbar />
        {children}
      </Harness>
    </UDIChatProvider>,
  );
}

const assayChip = () => screen.getByRole('button', { name: /Assay Type/ });

describe('FilterToolbar', () => {
  it('opens a filter popover whose entity and field are fixed', async () => {
    renderToolbar();
    await userEvent.click(assayChip());

    // Shown as text, not as disabled pickers.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('dialog')).toHaveTextContent('Filtering Datasets › Assay Type');
    // The values are still editable.
    expect(screen.getByRole('checkbox', { name: 'CODEX' })).toBeChecked();
  });

  it('Clear all keeps the chip, now all-inclusive', async () => {
    renderToolbar();
    await userEvent.click(assayChip());
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(filters.getState().dataSelections['message-filter-0-0'].selection).toEqual({
      assay_type: [],
    });
    expect(assayChip()).toHaveTextContent('All');
  });

  it('Remove filter takes the chip away', async () => {
    renderToolbar();
    await userEvent.click(assayChip());
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter' }));

    expect(screen.queryByRole('button', { name: /Assay Type/ })).toBeNull();
    expect(filters.getState().removedFilters['message-filter-0-0']).toBe(true);
  });

  it('Reset clears every filter and keeps every chip', async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(assayChip()).toHaveTextContent('All');
    expect(screen.getByRole('button', { name: /File Size/ })).toHaveTextContent('All');
  });

  it('links a chip and its chat widget on hover, each lighting the other', async () => {
    renderToolbar();
    await userEvent.hover(assayChip());
    expect(filters.getState().hoveredFilter).toEqual({
      id: 'message-filter-0-0',
      from: 'toolbar',
    });
    // Hovering from the toolbar lights the chat widget, not the chip itself.
    expect(assayChip().className).not.toMatch(/ring-2/);
    await userEvent.unhover(assayChip());
    expect(filters.getState().hoveredFilter).toBeNull();

    // The chat widget hovered: its chip lights.
    act(() => filters.getState().setHoveredFilter({ id: 'message-filter-0-0', from: 'chat' }));
    expect(assayChip().className).toMatch(/ring-2/);
    expect(screen.getByRole('button', { name: /File Size/ }).className).not.toMatch(/ring-2/);
  });

  it('edits a range by typing its bounds, with no Clear all beside its reset', async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: /File Size/ }));
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();

    const range = () => filters.getState().dataSelections['message-filter-1-0'].selection;
    const min = screen.getByRole('spinbutton', { name: 'Minimum file_size' });
    const max = screen.getByRole('spinbutton', { name: 'Maximum file_size' });
    await userEvent.clear(min);
    await userEvent.type(min, '20{Enter}');
    expect(range()).toEqual({ file_size: [20, 50] });

    // Past the other bound: stops at it.
    await userEvent.clear(max);
    await userEvent.type(max, '5{Enter}');
    expect(range()).toEqual({ file_size: [20, 20] });
    expect(max).toHaveValue(20);

    // Past the extent: the extent's end, shown as "max".
    await userEvent.clear(max);
    await userEvent.type(max, '500{Enter}');
    expect(range()).toEqual({ file_size: [20, 100] });
    expect(max).toHaveValue(null);

    // Emptied, committed on blur: the extent's end too.
    await userEvent.clear(min);
    await userEvent.tab();
    expect(range()).toEqual({ file_size: [0, 100] });

    // Escape drops the edit.
    await userEvent.type(min, '30{Escape}');
    expect(range()).toEqual({ file_size: [0, 100] });
  });

  // The chat widget renders the same filter at the same time. A label whose id
  // matched the widget's checkbox toggled that one: a click outside the
  // popover, which closed it.
  it('toggles from a value label without closing, beside the chat widget', async () => {
    const assay = {
      dataSourceKey: 'datasets',
      type: 'point' as const,
      selection: { assay_type: ['CODEX', 'MIBI'] },
    };
    renderToolbar({
      children: (
        <FilterControls filterId="message-filter-0-0" selection={assay} tweakable={false} />
      ),
    });
    await userEvent.click(assayChip());
    const popover = screen.getByRole('dialog');
    // Each label points into its own popover, not at the widget's checkbox.
    for (const label of popover.querySelectorAll('label')) {
      expect(popover.contains(document.getElementById(label.htmlFor))).toBe(true);
    }
    await userEvent.click(within(popover).getByText('AF'));

    expect(screen.getByRole('dialog')).toBe(popover);
    expect(filters.getState().dataSelections['message-filter-0-0'].selection).toEqual({
      assay_type: ['CODEX', 'MIBI', 'AF'],
    });
  });

  it('offers Remove in read-only too', async () => {
    renderToolbar({ readOnly: true });
    await userEvent.click(assayChip());
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter' }));

    expect(screen.queryByRole('button', { name: /Assay Type/ })).toBeNull();
    expect(filters.getState().removedFilters['message-filter-0-0']).toBe(true);
  });
});
