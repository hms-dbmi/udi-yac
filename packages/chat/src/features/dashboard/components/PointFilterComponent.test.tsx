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
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import { UDIChatProvider, useDataPackage, useDataPackageStore } from '@/app/UDIChatContext';
import { PointFilterComponent } from './PointFilterComponent';
import type { PresentValues } from '../hooks/usePresentFieldValues';

// The narrowing query has tests of its own (presentValues.test.ts); here it
// answers whatever a test sets.
const present = vi.hoisted(() => ({ current: {} as PresentValues }));
vi.mock('../hooks/usePresentFieldValues', () => ({
  usePresentFieldValues: () => present.current,
}));
import type { DataSelection } from '../stores/dataFiltersStore';
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
          { name: 'diagnosis', 'udi:data_type': 'nominal' },
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

/** Twelve values: past the search and chip thresholds of ten. */
const DIAGNOSES = Array.from({ length: 12 }, (_, i) => `Diagnosis ${String.fromCharCode(65 + i)}`);

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
    entity: 'Event',
    field: 'diagnosis',
    type: 'point',
    fieldDescription: '',
    domain: { values: DIAGNOSES },
  },
  {
    entity: 'Donor',
    field: 'sex',
    type: 'point',
    fieldDescription: '',
    domain: { values: ['Female', 'Male'] },
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
      entityNames: ['Event', 'Donor'],
      categoricalSourceFields: {
        Event: ['organization_name', 'event_type', 'protocol_name_and_arm', 'diagnosis'],
        Donor: ['sex'],
      },
    });
  }, [dataPackageStore, labels]);
  return loadingPhase === 'ready' ? <>{children}</> : null;
}

function renderFilter(
  selection: DataSelection,
  {
    tweakable = false,
    onCommit = () => {},
    ...labels
  }: LabelOverrides & { tweakable?: boolean; onCommit?: (s: DataSelection) => void } = {},
) {
  return render(
    <UDIChatProvider>
      <Harness labels={labels}>
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

  it('renders unchecked, not an error, for a cleared field (toolbar chip clear)', () => {
    renderFilter({ dataSourceKey: 'Event', type: 'point', selection: { organization_name: [] } });
    expect(screen.queryByText(/Invalid filter/)).toBeNull();
    expect(screen.getByText('CHOP')).toBeTruthy();
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

describe('PointFilterComponent — long lists', () => {
  const diagnosis = (values: string[]): DataSelection => ({
    dataSourceKey: 'Event',
    type: 'point',
    selection: { diagnosis: values },
  });
  const chipRemovers = () => screen.queryAllByRole('button', { name: /^Remove / });

  it('shows the selected values as chips when they are a few of many', () => {
    renderFilter(diagnosis(['Diagnosis B', 'Diagnosis K']));
    expect(chipRemovers().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove Diagnosis B',
      'Remove Diagnosis K',
    ]);
    // In addition to the checkboxes, not instead of them.
    expect(screen.getAllByRole('checkbox')).toHaveLength(DIAGNOSES.length + 1);
  });

  it('shows no chips for none, all, more than ten, or a short list', () => {
    const { unmount } = renderFilter(diagnosis([]));
    expect(chipRemovers()).toHaveLength(0);
    unmount();
    const all = renderFilter(diagnosis(DIAGNOSES));
    expect(chipRemovers()).toHaveLength(0);
    all.unmount();
    const eleven = renderFilter(diagnosis(DIAGNOSES.slice(0, 11)));
    expect(chipRemovers()).toHaveLength(0);
    eleven.unmount();
    renderFilter({
      dataSourceKey: 'Event',
      type: 'point',
      selection: { organization_name: ['CHOP'] },
    });
    expect(chipRemovers()).toHaveLength(0);
  });

  it("unchecks a value from its chip's remove button", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderFilter(diagnosis(['Diagnosis B', 'Diagnosis K']), { onCommit });
    await user.click(screen.getByRole('button', { name: 'Remove Diagnosis B' }));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ selection: { diagnosis: ['Diagnosis K'] } }),
    );
  });

  it('searches a long list only, without changing the filter', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderFilter(diagnosis(['Diagnosis B']), { onCommit });
    await user.type(screen.getByRole('textbox', { name: 'Search values' }), 'diagnosis k');
    expect(screen.queryByLabelText('Diagnosis A')).toBeNull();
    expect(screen.getByText('1 of 12 shown')).toBeTruthy();
    // The checked value is out of the list but still in the filter, and
    // still visible as a chip.
    expect(screen.getByRole('button', { name: 'Remove Diagnosis B' })).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: 'Diagnosis K' }));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ selection: { diagnosis: ['Diagnosis B', 'Diagnosis K'] } }),
    );
  });

  it('matches the display label as well as the raw value', async () => {
    const user = userEvent.setup();
    renderFilter(diagnosis([]), { valueLabels: { 'Diagnosis C': 'Medulloblastoma' } });
    await user.type(screen.getByRole('textbox', { name: 'Search values' }), 'medullo');
    expect(screen.getByText('1 of 12 shown')).toBeTruthy();
  });

  it('has no search box on a short list', () => {
    renderFilter({ dataSourceKey: 'Event', type: 'point', selection: { organization_name: [] } });
    expect(screen.queryByRole('textbox', { name: 'Search values' })).toBeNull();
  });
});

describe('PointFilterComponent — narrowed by the other filters', () => {
  afterEach(() => {
    present.current = {};
  });
  const diagnosis = (values: string[]): DataSelection => ({
    dataSourceKey: 'Event',
    type: 'point',
    selection: { diagnosis: values },
  });
  const listedLabels = () =>
    DIAGNOSES.filter((d) => screen.queryByRole('checkbox', { name: d }) != null);

  it('lists only the values the other filters leave, plus the checked ones, muted', () => {
    present.current = { diagnosis: new Set(['Diagnosis A', 'Diagnosis C']) };
    renderFilter(diagnosis(['Diagnosis K']));
    expect(listedLabels()).toEqual(['Diagnosis A', 'Diagnosis C', 'Diagnosis K']);
    expect(screen.getByText(/^2 of 12 match other filters/)).toBeTruthy();
    expect(screen.getByText('1 of 3 selected')).toBeTruthy();
    // Its chip and its row.
    expect(screen.getAllByTitle('Diagnosis K (no rows match the other filters)')).toHaveLength(2);
    // The select-all row plus the three listed.
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('shows the whole domain on request, and back', async () => {
    const user = userEvent.setup();
    present.current = { diagnosis: new Set(['Diagnosis A']) };
    renderFilter(diagnosis([]));
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(listedLabels()).toEqual(DIAGNOSES);
    expect(screen.getByText(/^Showing all 12/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Only matching' }));
    expect(listedLabels()).toEqual(['Diagnosis A']);
  });

  it('selects all of what it lists, never the hidden values', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    present.current = { diagnosis: new Set(['Diagnosis A', 'Diagnosis C']) };
    renderFilter(diagnosis(['Diagnosis K']), { onCommit });
    await user.click(screen.getByRole('checkbox', { name: '1 of 3 selected' }));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { diagnosis: ['Diagnosis A', 'Diagnosis C', 'Diagnosis K'] },
      }),
    );
  });

  it('says nothing when every value is present', () => {
    present.current = { diagnosis: new Set(DIAGNOSES) };
    renderFilter(diagnosis([]));
    expect(screen.queryByText(/match other filters/)).toBeNull();
    expect(listedLabels()).toEqual(DIAGNOSES);
  });
});

describe('PointFilterComponent — order', () => {
  // Row labels in page order, after the select-all row's.
  const labels = () =>
    Array.from(document.querySelectorAll('label'))
      .slice(1)
      .map((l) => l.textContent);

  it('lists values alphabetically by display label, in natural order', () => {
    renderFilter(
      { dataSourceKey: 'Event', type: 'point', selection: { organization_name: [] } },
      // UCSF is labelled "benioff": it sorts by the label, ahead of CHOP
      // despite the lower case.
      { valueLabels: { UCSF: 'benioff' } },
    );
    expect(labels()).toEqual(['benioff', 'CHOP', 'Seattle']);
  });

  it('orders the chips the same way, whatever order they were checked in', () => {
    renderFilter({
      dataSourceKey: 'Event',
      type: 'point',
      selection: { diagnosis: ['Diagnosis K', 'Diagnosis B'] },
    });
    expect(
      screen.getAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Remove Diagnosis B', 'Remove Diagnosis K']);
  });
});
