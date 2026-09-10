/**
 * @vitest-environment jsdom
 *
 * The quantitative grouping control: a survival curve split at a threshold has
 * to offer a way to move that threshold without asking the agent again.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import { UDIChatProvider, useDataPackage, useDataPackageStore } from '@/app/UDIChatContext';
import { StratifierGroupingControl } from './StratifierGroupingControl';
import type { GroupingTweakableParam } from './VizTweakComponent.types';
import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';

const pkg = {
  'udi:path': 'data',
  resources: [
    {
      name: 'Demographics',
      path: 'demographics.csv',
      'udi:row_count': 914,
      schema: {
        fields: [
          { name: 'research_id', 'udi:data_type': 'nominal' },
          { name: 'birth_date', 'udi:data_type': 'quantitative' },
        ],
      },
    },
  ],
} as unknown as DataPackage;

const domains: DataFieldDomain[] = [
  {
    entity: 'Demographics',
    field: 'birth_date',
    type: 'interval',
    fieldDescription: '',
    domain: { min: 1989, max: 2023 },
  },
];

function Harness({ children }: { children: ReactNode }) {
  const dataPackageStore = useDataPackageStore();
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

function quantitativeParam(
  overrides: Partial<GroupingTweakableParam> = {},
): GroupingTweakableParam {
  return {
    kind: 'grouping',
    label: 'groups',
    param: 'grouping',
    placeholder: 'GROUP',
    value: { type: 'quantitative', cuts: [2010] },
    stratifier: 'birth_date',
    stratifierType: 'quantitative',
    entity: 'Demographics',
    ...overrides,
  };
}

function renderControl(param: GroupingTweakableParam, onApply = vi.fn()) {
  render(
    <UDIChatProvider>
      <Harness>
        <StratifierGroupingControl param={param} onApply={onApply} />
      </Harness>
    </UDIChatProvider>,
  );
  return onApply;
}

// The popover renders into a portal outside the container, which survives an
// unmounted tree — without this the next test finds two triggers.
afterEach(cleanup);

describe('StratifierGroupingControl — quantitative', () => {
  it('shows the current split on the trigger', () => {
    renderControl(quantitativeParam());
    expect(screen.getByRole('button').textContent).toContain('2 groups');
  });

  it('opens a cut-point editor showing the bound threshold', async () => {
    const user = userEvent.setup();
    renderControl(quantitativeParam());
    await user.click(screen.getByRole('button'));

    const cut = screen.getByLabelText('Cut point 1') as HTMLInputElement;
    expect(cut.value).toBe('2010');
    // The distribution the threshold is dragged over, bounded by the field's
    // domain rather than by whatever rows are currently in view.
    expect(screen.getByText('1989')).toBeTruthy();
    expect(screen.getByText('2023')).toBeTruthy();
    // And the strata it currently produces, spelled the way the chart will.
    expect(screen.getByText(/< 2010 · ≥ 2010/)).toBeTruthy();
  });

  it('applies a typed threshold as a grouping object', async () => {
    const user = userEvent.setup();
    const onApply = renderControl(quantitativeParam());

    await user.click(screen.getByRole('button'));
    const cut = screen.getByLabelText('Cut point 1');
    await user.clear(cut);
    await user.type(cut, '2015');
    await user.tab();

    expect(onApply).toHaveBeenCalled();
    expect(onApply.mock.calls.at(-1)![0]).toMatchObject({
      type: 'quantitative',
      cuts: [2015],
    });
  });

  it('offers a preset that splits the range without typing', async () => {
    const user = userEvent.setup();
    const onApply = renderControl(quantitativeParam());

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button', { name: 'Halve' }));

    // Midpoint of the field's own domain, 1989..2023.
    expect(onApply.mock.calls.at(-1)![0]).toMatchObject({ cuts: [2006] });
  });
});
