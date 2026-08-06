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
import type { StoreApi } from 'zustand/vanilla';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('udi-toolkit/react', () => ({
  UDIVis: () => <div data-testid="udi-vis" />,
  usePalette: () => undefined,
}));

import {
  UDIChatProvider,
  useDashboardStore,
  useDataPackage,
  useDataPackageStore,
  useGlobalStore,
} from '@/app/UDIChatContext';
import type { DashboardState } from '@/features/dashboard';
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
          { name: 'hubmap_id', type: 'string', 'udi:data_type': 'nominal', 'udi:unique': true },
          {
            name: 'age',
            type: 'number',
            'udi:data_type': 'quantitative',
            description: 'Age at death in years',
          },
          { name: 'sex', type: 'string', 'udi:data_type': 'nominal' },
          { name: 'race', type: 'string', 'udi:data_type': 'nominal' },
          { name: 'species', type: 'string', 'udi:data_type': 'nominal' },
          // Unique by accident, referenced by nothing — must not be badged a key.
          {
            name: 'created_timestamp',
            type: 'datetime',
            'udi:data_type': 'nominal',
            'udi:unique': true,
          },
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
  // More than the inline limit, so it renders as a disclosure with a count.
  {
    entity: 'donors',
    field: 'race',
    type: 'point',
    domain: { values: Array.from({ length: 12 }, (_, i) => `race-${i}`) },
    fieldDescription: '',
  },
  {
    entity: 'donors',
    field: 'created_timestamp',
    type: 'point',
    domain: { values: ['2020-01-01', '2020-01-02'] },
    fieldDescription: '',
  },
  // Exactly one value — shown as itself rather than a "1 value" disclosure.
  {
    entity: 'donors',
    field: 'species',
    type: 'point',
    domain: { values: ['Homo sapiens'] },
    fieldDescription: '',
  },
];

/** Set by the Harness so a test can inspect what the pop-out actually stored. */
let dashboard: StoreApi<DashboardState>;

/** Seeds both stores, then gates children on a store value so the panel mounts after. */
function Harness({ entity, children }: { entity: string | null; children: ReactNode }) {
  const dataPackageStore = useDataPackageStore();
  const globalStore = useGlobalStore();
  const dashboardStore = useDashboardStore();
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  useEffect(() => {
    dashboard = dashboardStore;
    dataPackageStore.setState({
      dataPackage: pkg,
      dataFieldDomains: domains,
      entityNames: ['donors', 'samples'],
      loadingPhase: 'ready',
    });
    globalStore.getState().setOverview(true, entity);
  }, [dataPackageStore, globalStore, dashboardStore, entity]);
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
    expect(screen.getByText('Homo sapiens')).toBeTruthy();
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

  it('labels both columns of the field table', () => {
    renderPanel('donors');
    // Group labels use the same vocabulary as `udi:data_type` and the hover card.
    expect(screen.getAllByText('Possible values').length).toBeGreaterThan(0);
    expect(screen.getByText('Quantitative')).toBeTruthy();
    expect(screen.getByText('Nominal')).toBeTruthy();
  });

  it('shows a lone value as itself and counts anything more', async () => {
    renderPanel('donors');
    // One value: no disclosure, just the value.
    expect(screen.getByText('Homo sapiens')).toBeTruthy();
    // Two is already more than one, so it collapses too — `sex` and
    // `created_timestamp` both have two.
    expect(screen.getAllByText('2 values')).toHaveLength(2);
    expect(screen.queryByText('Female')).toBeNull();

    // Values live behind the disclosure and are only mounted once opened.
    expect(screen.queryByText('race-7')).toBeNull();
    await userEvent.click(screen.getByText('12 values'));
    expect(screen.getByText('race-7')).toBeTruthy();
  });

  it('shows a described field on hover, in the same card the chat uses', async () => {
    renderPanel('donors');
    expect(screen.queryByText('Age at death in years')).toBeNull();

    await userEvent.hover(screen.getByText('age'));
    await waitFor(() => expect(screen.getByText('Age at death in years')).toBeTruthy());
    // The shared FieldTooltipContent also badges the field's udi:data_type.
    expect(screen.getByText('quantitative')).toBeTruthy();
  });

  it('marks described fields with an info icon and leaves undescribed ones plain', () => {
    renderPanel('donors');
    // The icon is the affordance that makes the hover discoverable at a glance.
    // Neither row has a key badge or a disclosure chevron — `species` has a
    // single value, so it renders inline — meaning an svg can only be the info
    // icon.
    expect(screen.getByText('age').closest('li')?.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('species').closest('li')?.querySelector('svg')).toBeNull();
  });

  it('badges only fields that are keys in a relationship', () => {
    renderPanel('donors');
    // donors.hubmap_id is the primary key and the target of two foreign keys.
    // created_timestamp is flagged `udi:unique` in the manifest — which
    // dataPackageStore.getKeyFields counts as a key — but nothing references it.
    const badges = screen.getAllByLabelText('key field');
    expect(badges).toHaveLength(1);
    const keyRow = badges[0].closest('li');
    expect(keyRow?.textContent).toContain('hubmap_id');
    expect(keyRow?.textContent).not.toContain('created_timestamp');
  });

  it('filters fields by their values, not just their names', async () => {
    renderPanel('donors');
    const filter = screen.getByLabelText('Filter donors fields or values');

    // "race-7" is a value of `race`; no field is named that.
    await userEvent.type(filter, 'race-7');
    expect(screen.getByText('race')).toBeTruthy();
    expect(screen.queryByText('sex')).toBeNull();
    expect(screen.queryByText('age')).toBeNull();
    // The label narrows to the match count so a hit among many values is findable.
    expect(screen.getByText('1 of 12 values')).toBeTruthy();

    // A name match still shows the field's full value count.
    await userEvent.clear(filter);
    await userEvent.type(filter, 'race');
    expect(screen.getByText('12 values')).toBeTruthy();
  });

  it('pops the table to the dashboard without baking in the active filters', async () => {
    renderPanel('donors');
    expect(dashboard.getState().activeVisualizations.size).toBe(0);

    await userEvent.click(screen.getByLabelText('Open donors rows on the dashboard'));

    const active = dashboard.getState().activeVisualizations;
    expect(active.size).toBe(1);
    const [key, viz] = [...active.entries()][0];
    // Negative message index: cannot collide with a chat-derived card.
    expect(key).toBe('-1-0');
    expect(viz.title).toBe('donors rows');
    expect(viz.spec.source).toMatchObject({ name: 'donors' });
    // dashboardStore.updateSpecFilters prepends the active named filters to
    // viz.spec.transformation, so carrying them here would filter twice.
    expect(viz.spec.transformation).toBeUndefined();

    // Popping the same entity again is a no-op rather than a duplicate card.
    await userEvent.click(screen.getByLabelText('Open donors rows on the dashboard'));
    expect(dashboard.getState().activeVisualizations.size).toBe(1);
  });

  it('does not mount the row table until it is asked for', async () => {
    renderPanel('donors');
    // Mounting UDIVis costs ~1s for a wide entity (ag-grid RowNodes + a Vue
    // render root per cell + a full column scan per mapping), which blocked the
    // whole panel. Expanding must stay metadata-only.
    expect(screen.queryByTestId('udi-vis')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Show 499 rows/ }));
    await waitFor(() => expect(screen.getByTestId('udi-vis')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /Hide/ }));
    expect(screen.queryByTestId('udi-vis')).toBeNull();
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
