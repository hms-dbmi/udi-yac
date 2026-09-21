/**
 * @vitest-environment jsdom
 *
 * The quantitative grouping control: a survival curve split at a threshold has
 * to offer a way to move that threshold without asking the agent again.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
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

/** Render the control inside a host the popover is meant to anchor against. */
function renderInHost(hostAttr: 'data-udi-viz-card' | 'data-udi-chat-column', width: number) {
  const { container } = render(
    <UDIChatProvider>
      <Harness>
        <div {...{ [hostAttr]: '' }}>
          <StratifierGroupingControl param={quantitativeParam()} onApply={vi.fn()} />
        </div>
      </Harness>
    </UDIChatProvider>,
  );
  const host = container.querySelector(`[${hostAttr}]`) as HTMLElement;
  // jsdom measures everything as zero; the positioner reads the anchor's rect
  // into --anchor-width, so a distinct width per host says which was anchored.
  host.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height: 600, right: width, bottom: 600, x: 0, y: 0 }) as DOMRect;
  return host;
}

function positionerStyle() {
  const popup = document.querySelector('[data-slot="popover-content"]')!;
  return {
    side: popup.getAttribute('data-side'),
    anchorWidth: (popup.parentElement as HTMLElement).style.getPropertyValue('--anchor-width'),
  };
}

// The popover renders into a portal outside the container, which survives an
// unmounted tree — without this the next test finds two triggers.
afterEach(cleanup);

// jsdom has no PointerEvent, and without it fireEvent.pointerMove drops the
// clientX the histogram maps to a cut value.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).PointerEvent = MouseEvent;

/** Drag the sole cut handle to `ratio` across the plot. */
function dragCutTo(ratio: number) {
  const svg = document.body.querySelector('svg')!;
  // Every jsdom element measures zero, and the component divides by the width.
  svg.getBoundingClientRect = () =>
    ({ left: 0, width: 100, top: 0, height: 72, right: 100, bottom: 72, x: 0, y: 0 }) as DOMRect;
  const handle = document.body.querySelector('svg rect[fill="transparent"]')!;
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 });
  fireEvent.pointerMove(svg, { pointerId: 1, clientX: ratio * 100 });
  fireEvent.pointerUp(svg, { pointerId: 1, clientX: ratio * 100 });
}

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

  it('leaves the other cuts alone while a threshold is being typed', async () => {
    // The reported bug. The cut list is kept sorted, so reporting each
    // keystroke meant typing "2015" into the upper of two cuts sent "2"
    // through moveCut first — which re-sorted to [2, 2000] and put a
    // different cut under the caret, so the rest of the edit landed on it.
    const user = userEvent.setup();
    const onApply = renderControl(
      quantitativeParam({ value: { type: 'quantitative', cuts: [2000, 2010] } }),
    );

    await user.click(screen.getByRole('button'));
    const upper = screen.getByLabelText('Cut point 2');
    await user.clear(upper);
    await user.type(upper, '2015');

    // Mid-edit: the neighbour has not moved and nothing has been re-bound.
    expect((screen.getByLabelText('Cut point 1') as HTMLInputElement).value).toBe('2000');
    expect(onApply).not.toHaveBeenCalled();

    await user.tab();
    expect(onApply.mock.calls.at(-1)![0]).toMatchObject({ cuts: [2000, 2015] });
  });

  it('does not re-bind when a cut is tabbed through unchanged', async () => {
    const user = userEvent.setup();
    const onApply = renderControl(quantitativeParam());

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByLabelText('Cut point 1'));
    await user.tab();

    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies a spinner step at once, without waiting for Enter or blur', async () => {
    // The step buttons and the arrow keys are a finished gesture, unlike a
    // half-typed number. Browsers report a step with no `inputType`, which is
    // what fireEvent.change produces here.
    const user = userEvent.setup();
    const onApply = renderControl(quantitativeParam());

    await user.click(screen.getByRole('button'));
    const cut = screen.getByLabelText('Cut point 1') as HTMLInputElement;
    fireEvent.change(cut, { target: { value: '2011' } });

    // No blur, no Enter — and it is already applied.
    expect(onApply.mock.calls.at(-1)![0]).toMatchObject({ cuts: [2011] });
    expect(cut.value).toBe('2011');
  });

  it('resets to the split the chart was built with, not to no split at all', async () => {
    const user = userEvent.setup();
    const onApply = renderControl(quantitativeParam());

    await user.click(screen.getByRole('button'));
    const cut = screen.getByLabelText('Cut point 1');
    await user.clear(cut);
    await user.type(cut, '2015');
    await user.tab();
    expect(onApply.mock.calls.at(-1)![0]).toMatchObject({ cuts: [2015] });

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    // Back to the agent's original cut — not '' , which is how Reset used to
    // spell "no grouping at all".
    expect(onApply.mock.calls.at(-1)![0]).toMatchObject({ cuts: [2010] });
  });

  it('shows a dragged threshold in the number box beside it', async () => {
    // Base UI moves focus into the popup on open, and the cut input is the
    // first focusable thing in it. Gating the "don't clobber what is being
    // typed" gate on focus therefore made the box permanently stale: the
    // histogram and the strata line moved while the number stayed put.
    const user = userEvent.setup();
    const onApply = renderControl(quantitativeParam());

    await user.click(screen.getByRole('button'));
    expect((screen.getByLabelText('Cut point 1') as HTMLInputElement).value).toBe('2010');

    // In the browser Base UI leaves focus on this input when the popover opens
    // — jsdom's focus timing varies between runs, so put it there explicitly.
    // The point is that a focused-but-untouched box must still follow the drag.
    (screen.getByLabelText('Cut point 1') as HTMLInputElement).focus();

    dragCutTo(0.5); // 1989 + 0.5 * 34 = 2006

    expect(onApply.mock.calls.at(-1)![0]).toMatchObject({ cuts: [2006] });
    expect((screen.getByLabelText('Cut point 1') as HTMLInputElement).value).toBe('2006');
    expect(screen.getByText(/< 2006 · ≥ 2006/)).toBeTruthy();
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

describe('StratifierGroupingControl — where the popover opens', () => {
  it('sits to the left of the card when opened from the dashboard', async () => {
    // Anchored to the trigger it lands on the chart it belongs to, which is the
    // one thing the reader needs to keep seeing.
    const user = userEvent.setup();
    renderInHost('data-udi-viz-card', 500);
    await user.click(screen.getAllByRole('button')[0]);

    const { side, anchorWidth } = positionerStyle();
    expect(side).toBe('left');
    expect(anchorWidth).toBe('500px'); // the card, not the trigger
  });

  it('takes its left edge from the chat column when opened from a bubble', async () => {
    // The trigger is indented inside a bubble, so 320px starting there spills
    // over the dashboard. The column's horizontal placement keeps it in the chat.
    const user = userEvent.setup();
    renderInHost('data-udi-chat-column', 400);
    await user.click(screen.getAllByRole('button')[0]);

    const { side, anchorWidth } = positionerStyle();
    expect(side).toBe('bottom');
    expect(anchorWidth).toBe('400px'); // the column, not the trigger
  });

  it('falls back to its trigger when it is in neither', async () => {
    // A consumer embedding the dashboard on its own still gets a usable popover.
    const user = userEvent.setup();
    renderControl(quantitativeParam());
    await user.click(screen.getAllByRole('button')[0]);

    expect(positionerStyle().side).toBe('bottom');
  });
});
