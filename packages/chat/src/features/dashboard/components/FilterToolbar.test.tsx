/**
 * @vitest-environment jsdom
 *
 * The Filters bar: each chip opens a popover holding its filter's controls,
 * with the entity/field fixed, a "Clear all" that keeps the filter in place
 * (its chip reads "All"), and a "Remove filter" that takes the chip away.
 */
import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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

function renderToolbar({ readOnly = false }: { readOnly?: boolean } = {}) {
  return render(
    <UDIChatProvider readOnly={readOnly}>
      <Harness>
        <FilterToolbar />
      </Harness>
    </UDIChatProvider>,
  );
}

const assayChip = () => screen.getByRole('button', { name: /Assay Type/ });

describe('FilterToolbar', () => {
  it('opens a filter popover whose entity and field are fixed', async () => {
    renderToolbar();
    await userEvent.click(assayChip());

    const [entity, field] = screen.getAllByRole('combobox');
    expect(entity).toHaveAttribute('data-disabled');
    expect(field).toHaveAttribute('data-disabled');
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

  it('offers no Remove in read-only, which has no chat to restore it from', async () => {
    renderToolbar({ readOnly: true });
    await userEvent.click(assayChip());

    expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove filter' })).toBeNull();
  });
});
