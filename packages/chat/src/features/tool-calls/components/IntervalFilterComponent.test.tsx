/**
 * @vitest-environment jsdom
 *
 * Regression tests for the entity/field pickers on an interval filter.
 * Base UI's Select fires `onValueChange` on every item press — including a
 * press on the already-selected item, which is a common way to dismiss the
 * menu. Both pickers reset the range to the field's full domain, so an
 * unguarded re-commit wiped a narrowed range (10–25 snapped back to min–max)
 * just from opening and closing a menu.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import { UDIChatProvider, useDataPackage, useDataPackageStore } from '@/app/UDIChatContext';
import { IntervalFilterComponent } from './IntervalFilterComponent';
import type { DataSelection } from '@/features/dashboard';
import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';

const pkg = {
  'udi:path': 'data',
  resources: [
    {
      name: 'Donor',
      path: 'donor.csv',
      'udi:row_count': 10,
      schema: {
        fields: [
          { name: 'age', 'udi:data_type': 'quantitative' },
          { name: 'bmi', 'udi:data_type': 'quantitative' },
        ],
      },
    },
    {
      name: 'Dataset',
      path: 'dataset.csv',
      'udi:row_count': 10,
      schema: {
        fields: [
          { name: 'age', 'udi:data_type': 'quantitative' },
          { name: 'file_count', 'udi:data_type': 'quantitative' },
        ],
      },
    },
    // No quantitative fields at all — nothing valid to fall back to.
    {
      name: 'Sample',
      path: 'sample.csv',
      'udi:row_count': 10,
      schema: { fields: [{ name: 'sample_type', 'udi:data_type': 'nominal' }] },
    },
  ],
} as unknown as DataPackage;

const domains: DataFieldDomain[] = [
  {
    entity: 'Donor',
    field: 'age',
    type: 'interval',
    fieldDescription: '',
    domain: { min: 0, max: 100 },
  },
  {
    entity: 'Donor',
    field: 'bmi',
    type: 'interval',
    fieldDescription: '',
    domain: { min: 10, max: 50 },
  },
  {
    entity: 'Dataset',
    field: 'age',
    type: 'interval',
    fieldDescription: '',
    domain: { min: 1, max: 9 },
  },
  {
    entity: 'Dataset',
    field: 'file_count',
    type: 'interval',
    fieldDescription: '',
    domain: { min: 2, max: 400 },
  },
];

function Harness({ children }: { children: ReactNode }) {
  const dataPackageStore = useDataPackageStore();
  // Gate children on a STORE value so they mount only after the seed — the
  // component under test subscribes to stable function slices and would not
  // re-render on a post-mount store update.
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  useEffect(() => {
    dataPackageStore.setState({
      dataPackage: pkg,
      dataFieldDomains: domains,
      loadingPhase: 'ready',
      // Derived maps the pickers read; normally computed on package load.
      entityNames: ['Donor', 'Dataset', 'Sample'],
      quantitativeSourceFields: {
        Donor: ['age', 'bmi'],
        Dataset: ['age', 'file_count'],
        Sample: [],
      },
      categoricalSourceFields: { Donor: [], Dataset: [], Sample: ['sample_type'] },
    });
  }, [dataPackageStore]);
  return loadingPhase === 'ready' ? <>{children}</> : null;
}

/** Renders a narrowed Donor filter — `age` 10–25 out of a 0–100 domain by default. */
function renderNarrowedFilter(
  onCommit: (s: DataSelection) => void,
  selection: DataSelection['selection'] = { age: [10, 25] },
) {
  const dataSelection: DataSelection = {
    dataSourceKey: 'Donor',
    type: 'interval',
    selection,
  };
  render(
    <UDIChatProvider>
      <Harness>
        <IntervalFilterComponent
          dataSelection={dataSelection}
          fieldIndex={0}
          tweakable
          filterKey="uuid-1"
          onCommit={onCommit}
        />
      </Harness>
    </UDIChatProvider>,
  );
}

/** [entityTrigger, fieldTrigger] — rendered in that order when tweakable. */
function pickers() {
  return screen.getAllByRole('combobox');
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
  await user.click(trigger);
  const list = await waitFor(() => screen.getByRole('listbox'));
  return list;
}

function optionsIn(list: HTMLElement) {
  // Queried off the popup rather than via getAllByRole so the portal container
  // (see useChatRoot) doesn't need to be part of the accessibility tree.
  return Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
}

function optionNamed(list: HTMLElement, name: string) {
  const match = optionsIn(list).find((o) => o.textContent === name);
  if (!match)
    throw new Error(`no option "${name}" in [${optionsIn(list).map((o) => o.textContent)}]`);
  return match;
}

describe('IntervalFilterComponent — entity/field pickers', () => {
  it('keeps a narrowed range when the field menu is dismissed by re-picking the same field', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderNarrowedFilter(onCommit);

    const list = await openMenu(user, pickers()[1]);
    await user.click(optionNamed(list, 'age'));

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
  });

  it('keeps a narrowed range when the entity menu is dismissed by re-picking the same entity', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderNarrowedFilter(onCommit);

    const list = await openMenu(user, pickers()[0]);
    await user.click(optionNamed(list, 'Donor'));

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
  });

  it('keeps a narrowed range when a menu is dismissed with Escape', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderNarrowedFilter(onCommit);

    await openMenu(user, pickers()[1]);
    await user.keyboard('{Escape}');

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
  });

  it('still resets to the new domain when a different field is picked', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderNarrowedFilter(onCommit);

    const list = await openMenu(user, pickers()[1]);
    await user.click(optionNamed(list, 'bmi'));

    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ dataSourceKey: 'Donor', selection: { bmi: [10, 50] } }),
    );
  });

  it("resets to the NEW entity's domain for the field, not the old entity's", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderNarrowedFilter(onCommit);

    const list = await openMenu(user, pickers()[0]);
    await user.click(optionNamed(list, 'Dataset'));

    // Donor.age spans 0-100, Dataset.age spans 1-9.
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ dataSourceKey: 'Dataset', selection: { age: [1, 9] } }),
    );
  });

  it("falls back to the new entity's first quantitative field when the current one is absent", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    // Donor.bmi -> Dataset, which has no `bmi`; carrying it over would commit a
    // filter that renders as "Error: Invalid filter."
    renderNarrowedFilter(onCommit, { bmi: [20, 30] });

    const list = await openMenu(user, pickers()[0]);
    await user.click(optionNamed(list, 'Dataset'));

    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ dataSourceKey: 'Dataset', selection: { age: [1, 9] } }),
    );
  });

  it('keeps the field when the new entity has no quantitative field to fall back to', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderNarrowedFilter(onCommit);

    const list = await openMenu(user, pickers()[0]);
    await user.click(optionNamed(list, 'Sample'));

    // Nothing valid to offer, so the field is carried over as-is and the
    // widget surfaces the invalid state rather than inventing a field.
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ dataSourceKey: 'Sample', selection: { age: [0, 100] } }),
    );
  });
});
