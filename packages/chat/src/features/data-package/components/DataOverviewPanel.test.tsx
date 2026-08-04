/**
 * @vitest-environment jsdom
 *
 * Guards the one piece of hand-rolled state in the overview: the accordion is
 * controlled locally (so collapsing an item does not close the panel) but has
 * to re-sync whenever something else names an entity — a count chip, a schema
 * diagram node, a relationship link. That sync uses React's adjust-state-
 * during-render pattern, which is easy to break silently.
 *
 * UDIVis is mocked: it boots a Vue custom element on mount, which the chat
 * package deliberately does not exercise in jsdom (it is tested in udi-toolkit).
 */
import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('udi-toolkit/react', () => ({
  UDIVis: () => <div data-testid="udi-vis" />,
  usePalette: () => undefined,
}));

import {
  UDIChatProvider,
  useDataPackage,
  useDataPackageStore,
  useGlobalStore,
} from '@/app/UDIChatContext';
import type { DataFieldDomain, DataPackage } from '@/types/dataPackage';
import { DataOverviewPanel } from './DataOverviewPanel';

const pkg = {
  'udi:path': './data/test/',
  resources: [
    {
      name: 'donors',
      path: 'donors.tsv',
      'udi:row_count': 499,
      schema: {
        primaryKey: ['hubmap_id'],
        foreignKeys: [],
        fields: [
          { name: 'hubmap_id', type: 'string', 'udi:data_type': 'nominal' },
          { name: 'age', type: 'number', 'udi:data_type': 'quantitative' },
          { name: 'sex', type: 'string', 'udi:data_type': 'nominal' },
        ],
      },
    },
    {
      name: 'samples',
      path: 'samples.tsv',
      'udi:row_count': 5044,
      schema: {
        primaryKey: ['hubmap_id'],
        foreignKeys: [
          {
            fields: ['donor.hubmap_id'],
            reference: { resource: 'donors', fields: ['hubmap_id'] },
            'udi:cardinality': { from: 'many', to: 'one' },
          },
        ],
        fields: [
          { name: 'hubmap_id', type: 'string', 'udi:data_type': 'nominal' },
          { name: 'weight_value', type: 'number', 'udi:data_type': 'quantitative' },
        ],
      },
    },
  ],
} as unknown as DataPackage;

const domains: DataFieldDomain[] = [
  {
    entity: 'donors',
    field: 'age',
    type: 'interval',
    domain: { min: 3, max: 88 },
    fieldDescription: '',
  },
  {
    entity: 'donors',
    field: 'sex',
    type: 'point',
    domain: { values: ['Female', 'Male'] },
    fieldDescription: '',
  },
  {
    entity: 'samples',
    field: 'weight_value',
    type: 'interval',
    domain: { min: 0.5, max: 12 },
    fieldDescription: '',
  },
];

/** Seeds both stores, then gates children on a store value so the panel mounts after. */
function Harness({ entity, children }: { entity: string | null; children: ReactNode }) {
  const dataPackageStore = useDataPackageStore();
  const globalStore = useGlobalStore();
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  useEffect(() => {
    dataPackageStore.setState({
      dataPackage: pkg,
      dataFieldDomains: domains,
      entityNames: ['donors', 'samples'],
      loadingPhase: 'ready',
    });
    globalStore.getState().setOverview(true, entity);
  }, [dataPackageStore, globalStore, entity]);
  return loadingPhase === 'ready' ? <>{children}</> : null;
}

function renderPanel(entity: string | null) {
  return render(
    <UDIChatProvider>
      <Harness entity={entity}>
        <DataOverviewPanel />
      </Harness>
    </UDIChatProvider>,
  );
}

/**
 * An entity name matches three buttons — the schema diagram node, the accordion
 * trigger, and any relationship link. Only the trigger carries `aria-expanded`.
 */
function accordionTrigger(entity: string): HTMLElement {
  const triggers = screen
    .getAllByRole('button', { name: new RegExp(entity) })
    .filter((el) => el.hasAttribute('aria-expanded'));
  expect(triggers).toHaveLength(1);
  return triggers[0];
}

describe('DataOverviewPanel', () => {
  it('expands the entity named in the store and shows its ranges and categories', () => {
    renderPanel('donors');
    expect(accordionTrigger('donors')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('age')).toBeTruthy();
    expect(screen.getByText('3 – 88')).toBeTruthy();
    expect(screen.getByText('Female, Male')).toBeTruthy();
    // samples is listed but collapsed, so its fields are not mounted.
    expect(accordionTrigger('samples')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('0.5 – 12')).toBeNull();
  });

  it('re-syncs when another entity is named while the panel stays open', () => {
    const { rerender } = renderPanel('donors');
    expect(screen.getByText('3 – 88')).toBeTruthy();

    rerender(
      <UDIChatProvider>
        <Harness entity="samples">
          <DataOverviewPanel />
        </Harness>
      </UDIChatProvider>,
    );

    expect(screen.getByText('0.5 – 12')).toBeTruthy();
  });

  it('shows relationships with cardinality read from the entity outward', () => {
    renderPanel('samples');
    expect(screen.getByText(/donor\.hubmap_id = hubmap_id/)).toBeTruthy();
    expect(screen.getByText(/many-to-one/)).toBeTruthy();
  });

  it('collapsing the expanded item leaves the panel open', async () => {
    renderPanel('donors');
    await userEvent.click(accordionTrigger('donors'));
    expect(accordionTrigger('donors')).toHaveAttribute('aria-expanded', 'false');
    // Still the overview, not the chat: the header and both entities remain.
    expect(screen.getByText('Data')).toBeTruthy();
    expect(accordionTrigger('samples')).toBeTruthy();
  });
});
