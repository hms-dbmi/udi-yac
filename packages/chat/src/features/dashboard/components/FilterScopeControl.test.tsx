/**
 * @vitest-environment jsdom
 *
 * A filter's scope control: rows | any | all | none, writing the scope the
 * charts and the agent read, and the chip that says it in words.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
import type { DataFiltersState, DataSelection } from '../stores/dataFiltersStore';
import { FilterControls } from './FilterControls';
import { FilterToolbar } from './FilterToolbar';

const pkg = {
  'udi:path': 'data',
  resources: [
    { name: 'Patient', path: 'patient.csv', schema: { fields: [{ name: 'id' }] } },
    {
      name: 'Event',
      path: 'event.csv',
      schema: {
        fields: [{ name: 'patient_id' }, { name: 'diagnosis', 'udi:data_type': 'nominal' }],
        foreignKeys: [
          { fields: ['patient_id'], reference: { resource: 'Patient', fields: ['id'] } },
        ],
      },
    },
    { name: 'Site', path: 'site.csv', schema: { fields: [{ name: 'region' }] } },
  ],
} as unknown as DataPackage;

const domains: DataFieldDomain[] = [
  {
    entity: 'Event',
    field: 'diagnosis',
    type: 'point',
    fieldDescription: '',
    domain: { values: ['Group 3', 'SHH'] },
  },
  {
    entity: 'Site',
    field: 'region',
    type: 'point',
    fieldDescription: '',
    domain: { values: ['North', 'South'] },
  },
];

const group3: DataSelection = {
  dataSourceKey: 'Event',
  type: 'point',
  selection: { diagnosis: ['Group 3'] },
};
const ID = 'message-filter-0-0';

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
      sourceFields: { Event: ['patient_id', 'diagnosis'], Site: ['region'] },
      categoricalSourceFields: { Event: ['diagnosis'], Site: ['region'] },
      quantitativeSourceFields: {},
      entityNames: ['Patient', 'Event', 'Site'],
      loadingPhase: 'ready',
    });
    dataFiltersStore.getState().setDataSelection(ID, group3);
  }, [dataPackageStore, dataFiltersStore]);
  return loadingPhase === 'ready' ? <>{children}</> : null;
}

const renderIn = (node: ReactNode) =>
  render(
    <UDIChatProvider>
      <Harness>{node}</Harness>
    </UDIChatProvider>,
  );

describe('FilterScopeControl', () => {
  it('starts at rows and scopes the filter to the parent table', async () => {
    renderIn(<FilterControls filterId={ID} selection={group3} tweakable={false} />);
    expect(screen.getByRole('radio', { name: 'rows' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Match per Patient:')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'none' }));
    expect(filters.getState().filterScopes[ID]).toEqual({ entity: 'Patient', match: 'none' });
    expect(screen.getByRole('radio', { name: 'none' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Patient with no Event where')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'rows' }));
    expect(filters.getState().filterScopes).toEqual({});
  });

  it('is absent for a chart brush and for a table that links to nothing', () => {
    const region: DataSelection = {
      dataSourceKey: 'Site',
      type: 'point',
      selection: { region: ['North'] },
    };
    renderIn(
      <>
        <FilterControls filterId="udi_1_1" selection={group3} tweakable={false} />
        <FilterControls filterId="message-filter-1-0" selection={region} tweakable={false} />
      </>,
    );
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('puts the scope in words on the filter chip', async () => {
    renderIn(<FilterToolbar />);
    await screen.findByRole('button', { name: /Diagnosis/ });
    expect(screen.queryByText(/Patient with any Event where/)).not.toBeInTheDocument();

    filters.getState().setFilterScope(ID, { entity: 'Patient', match: 'any' });
    expect(
      await screen.findByRole('button', { name: /Patient with any Event where.*Diagnosis/ }),
    ).toBeInTheDocument();
  });
});
