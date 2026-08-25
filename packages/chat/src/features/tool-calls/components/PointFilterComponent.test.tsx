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

/** Optional display labels, as a package author would supply them. */
interface LabelOverrides {
  fieldTitles?: Record<string, string>;
  valueLabels?: Record<string, string>;
}

function packageWith({ fieldTitles, valueLabels }: LabelOverrides): DataPackage {
  const next = JSON.parse(JSON.stringify(pkg)) as DataPackage;
  if (fieldTitles) {
    for (const f of next.resources[0].schema.fields) {
      if (fieldTitles[f.name]) f.title = fieldTitles[f.name];
    }
  }
  if (valueLabels) next['udi:labels'] = valueLabels;
  return next;
}

function Harness({ children, labels }: { children: ReactNode; labels: LabelOverrides }) {
  const dataPackageStore = useDataPackageStore();
  // Gate children on a STORE value so they mount only after the seed —
  // the component under test subscribes to stable function slices and
  // would not re-render on a post-mount store update.
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  useEffect(() => {
    dataPackageStore.setState({
      dataPackage: packageWith(labels),
      dataFieldDomains: domains,
      loadingPhase: 'ready',
    });
  }, [dataPackageStore, labels]);
  return loadingPhase === 'ready' ? <>{children}</> : null;
}

function renderFilter(selection: DataSelection, labels: LabelOverrides = {}) {
  return render(
    <UDIChatProvider>
      <Harness labels={labels}>
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
    // Per-field section labels, shown with the data package's display label —
    // here the humanized fallback, since these fields carry no `title`.
    expect(screen.getByText('Organization Name')).toBeTruthy();
    expect(screen.getByText('Event Type')).toBeTruthy();
    // Full domain options render for each field (not just clicked values)
    expect(screen.getByText('Seattle')).toBeTruthy();
    expect(screen.getByText('Progressive')).toBeTruthy();
    expect(screen.getByText('CHOP')).toBeTruthy();
  });

  it('shows the package labels for fields and values, filtering on the raw ones', () => {
    renderFilter(
      {
        dataSourceKey: 'Event',
        type: 'point',
        selection: { organization_name: ['CHOP'], event_type: ['Deceased'] },
      },
      {
        fieldTitles: { organization_name: 'Site' },
        valueLabels: { Seattle: "Seattle Children's" },
      },
    );

    expect(screen.getByText('Site')).toBeTruthy();
    expect(screen.queryByText('Organization Name')).toBeNull();
    expect(screen.getByText("Seattle Children's")).toBeTruthy();
    expect(screen.queryByText('Seattle')).toBeNull();
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
