/**
 * @vitest-environment jsdom
 *
 * Regression tests for chart-click (point) selections rendering as
 * multiselect widgets. A click on e.g. a stacked-bar segment produces a
 * MULTI-field selection ({organization_name: [...], event_type: [...]});
 * the component previously assumed single-field and showed
 * "Error: Invalid filter." High-cardinality fields whose domains were
 * dropped (removeLongDomains) must also render, falling back to the
 * clicked values as options.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import { UDIChatProvider, useDataPackage, useDataPackageStore } from '@/app/UDIChatContext';
import { PointFilterComponent } from './PointFilterComponent';
import type { DataSelection } from '@/features/dashboard';
import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';

const pkg = {
  'udi:path': 'data',
  resources: [
    {
      name: 'Event',
      path: 'event.csv',
      'udi:row_count': 10,
      schema: {
        fields: [
          { name: 'organization_name', 'udi:data_type': 'nominal' },
          { name: 'event_type', 'udi:data_type': 'nominal' },
          { name: 'protocol_name_and_arm', 'udi:data_type': 'nominal' },
        ],
      },
    },
    {
      name: 'Donor',
      path: 'donor.csv',
      'udi:row_count': 10,
      schema: { fields: [{ name: 'sex', 'udi:data_type': 'nominal' }] },
    },
  ],
} as unknown as DataPackage;

// protocol_name_and_arm deliberately has NO domain (high-cardinality drop).
const domains: DataFieldDomain[] = [
  {
    entity: 'Event',
    field: 'organization_name',
    type: 'point',
    fieldDescription: '',
    domain: { values: ['CHOP', 'Seattle', 'UCSF'] },
  },
  {
    entity: 'Event',
    field: 'event_type',
    type: 'point',
    fieldDescription: '',
    domain: { values: ['Deceased', 'Progressive', 'Recurrence'] },
  },
  {
    entity: 'Donor',
    field: 'sex',
    type: 'point',
    fieldDescription: '',
    domain: { values: ['Female', 'Male'] },
  },
];

function Harness({ children }: { children: ReactNode }) {
  const dataPackageStore = useDataPackageStore();
  // Gate children on a STORE value so they mount only after the seed —
  // the component under test subscribes to stable function slices and
  // would not re-render on a post-mount store update.
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  useEffect(() => {
    dataPackageStore.setState({
      dataPackage: pkg,
      dataFieldDomains: domains,
      loadingPhase: 'ready',
      entityNames: ['Event', 'Donor'],
      categoricalSourceFields: {
        Event: ['organization_name', 'event_type', 'protocol_name_and_arm'],
        Donor: ['sex'],
      },
    });
  }, [dataPackageStore]);
  return loadingPhase === 'ready' ? <>{children}</> : null;
}

function renderFilter(selection: DataSelection, { tweakable = false, onCommit = () => {} } = {}) {
  return render(
    <UDIChatProvider>
      <Harness>
        <PointFilterComponent
          dataSelection={selection}
          tweakable={tweakable}
          filterKey="uuid-1"
          onCommit={onCommit}
        />
      </Harness>
    </UDIChatProvider>,
  );
}

describe('PointFilterComponent — chart-click selections', () => {
  it('renders a multiselect per field for a multi-field click selection', () => {
    renderFilter({
      dataSourceKey: 'Event',
      type: 'point',
      selection: { organization_name: ['CHOP'], event_type: ['Deceased'] },
    });

    expect(screen.queryByText(/Invalid filter/)).toBeNull();
    // Per-field section labels
    expect(screen.getByText('organization_name')).toBeTruthy();
    expect(screen.getByText('event_type')).toBeTruthy();
    // Full domain options render for each field (not just clicked values)
    expect(screen.getByText('Seattle')).toBeTruthy();
    expect(screen.getByText('Progressive')).toBeTruthy();
    expect(screen.getByText('CHOP')).toBeTruthy();
  });

  it('falls back to selected values when a field has no domain (high cardinality)', () => {
    renderFilter({
      dataSourceKey: 'Event',
      type: 'point',
      selection: { protocol_name_and_arm: ['ACNS0331 Arm B'] },
    });

    expect(screen.queryByText(/Invalid filter/)).toBeNull();
    expect(screen.getByText('ACNS0331 Arm B')).toBeTruthy();
  });

  it('still errors when the selection has no fields at all', () => {
    renderFilter({ dataSourceKey: 'Event', type: 'point', selection: {} });
    expect(screen.getByText(/Invalid filter/)).toBeTruthy();
  });
});

/**
 * Same Base UI Select quirk as the interval filter: pressing the
 * already-selected item (a common way to dismiss the menu) fires
 * `onValueChange`, and both pickers clear the checked values.
 */
describe('PointFilterComponent — entity/field pickers', () => {
  it('keeps checked values when a menu is dismissed by re-picking the same option', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderFilter(
      {
        dataSourceKey: 'Event',
        type: 'point',
        selection: { organization_name: ['CHOP'] },
      },
      { tweakable: true, onCommit },
    );

    // [entity, field] pickers, rendered in that order.
    const fieldTrigger = screen.getAllByRole('combobox')[1];
    await user.click(fieldTrigger);
    const list = await waitFor(() => screen.getByRole('listbox'));
    const same = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (o) => o.textContent === 'organization_name',
    )!;
    await user.click(same);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("falls back to the new entity's first field when the current one is absent", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderFilter(
      {
        dataSourceKey: 'Event',
        type: 'point',
        selection: { organization_name: ['CHOP'] },
      },
      { tweakable: true, onCommit },
    );

    const entityTrigger = screen.getAllByRole('combobox')[0];
    await user.click(entityTrigger);
    const list = await waitFor(() => screen.getByRole('listbox'));
    const donor = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (o) => o.textContent === 'Donor',
    )!;
    await user.click(donor);

    // Donor has no `organization_name`; carrying it over would commit a filter
    // that renders as "Error: Invalid filter."
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ dataSourceKey: 'Donor', selection: { sex: [] } }),
    );
  });
});
