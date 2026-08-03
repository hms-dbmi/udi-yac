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
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    });
  }, [dataPackageStore]);
  return loadingPhase === 'ready' ? <>{children}</> : null;
}

function renderFilter(selection: DataSelection) {
  return render(
    <UDIChatProvider>
      <Harness>
        <PointFilterComponent
          dataSelection={selection}
          tweakable={false}
          filterKey="uuid-1"
          onCommit={() => {}}
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
