/**
 * @vitest-environment jsdom
 *
 * A card's selection and the column filters: a filter set anywhere is drawn
 * as the card's own selection, and the card's clicks are written back into
 * the column filters on its fields.
 *
 * UDIVis is mocked and its props captured, as in DashboardCard.test.tsx.
 */
import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import type { StoreApi } from 'zustand/vanilla';

interface VisProps {
  selections: Record<string, unknown>;
  onSelectionChange: (s: Record<string, unknown>) => void;
}
let vis: VisProps;
vi.mock('udi-toolkit/react', () => ({
  UDIVis: (props: VisProps) => {
    vis = props;
    return <div data-testid="udi-vis" />;
  },
  usePalette: () => undefined,
  describeTransformations: () => [],
}));

import {
  UDIChatProvider,
  useDashboard,
  useDashboardStore,
  useDataFilters,
  useDataFiltersStore,
} from '@/app/UDIChatContext';
import type { UDIGrammar } from 'udi-toolkit/react';
import type { DataFiltersState } from '../stores/dataFiltersStore';
import { DashboardCard } from './DashboardCard';

// Clicks select on sex and race: neither count axis is a source column.
const sexByRace = {
  source: { name: 'donors', source: 'donors.csv' },
  transformation: [{ groupby: ['sex', 'race'] }, { rollup: { n: { op: 'count' } } }],
  representation: {
    mark: 'bar',
    mapping: [
      { encoding: 'x', field: 'sex', type: 'nominal' },
      { encoding: 'color', field: 'race', type: 'nominal' },
      { encoding: 'y', field: 'n', type: 'quantitative' },
    ],
  },
} as unknown as UDIGrammar;

let filters: StoreApi<DataFiltersState>;
let uuid: string;

function Harness() {
  const store = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  useEffect(() => {
    filters = dataFiltersStore;
    store.getState().addActiveVisualization(0, 0, sexByRace, 'prompt', {
      donors: ['sex', 'race'],
    });
  }, [store, dataFiltersStore]);
  const viz = useDashboard((s) => s.activeVisualizations.get('0-0'));
  const selections = useDataFilters((s) => s.dataSelections);
  useEffect(() => {
    if (viz) uuid = viz.uuid;
  }, [viz]);
  if (!viz) return null;
  return <DashboardCard vizKey="0-0" viz={viz} selections={selections} />;
}

const point = (selection: Record<string, string[]>) => ({
  dataSourceKey: 'donors',
  type: 'point' as const,
  selection,
});

// Writes are coalesced per animation frame; `frame()` runs the queued ones.
let frames: FrameRequestCallback[] = [];
const frame = () => {
  const queued = frames;
  frames = [];
  queued.forEach((cb) => cb(0));
};

describe('DashboardCard — selections are column filters', () => {
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    render(
      <UDIChatProvider>
        <Harness />
      </UDIChatProvider>,
    );
  });

  it('draws a filter set elsewhere as its own selection', () => {
    act(() => filters.getState().setDataSelection('col:donors.sex', point({ sex: ['F'] })));
    expect(vis.selections[uuid]).toEqual(point({ sex: ['F'] }));
    // The filter itself is passed too, so the named filter resolves in Pinia.
    expect(vis.selections['col:donors.sex']).toEqual(point({ sex: ['F'] }));
  });

  it('writes its clicks into the column filters, once each', () => {
    // The mount binding the composed selection: only recorded.
    act(() => vis.onSelectionChange({ [uuid]: point({}) }));
    expect(filters.getState().dataSelections).toEqual({});

    act(() => vis.onSelectionChange({ [uuid]: point({ sex: ['M'], race: ['Asian'] }) }));
    act(frame);
    expect(filters.getState().dataSelections).toEqual({
      'col:donors.sex': point({ sex: ['M'] }),
      'col:donors.race': point({ race: ['Asian'] }),
    });
    expect(filters.getState().filterOrigins['col:donors.sex']).toBe('chart');

    // Chat then edits sex. A report another chart triggers still carries this
    // chart's previous selection, and must not undo the edit.
    act(() => filters.getState().setDataSelection('col:donors.sex', point({ sex: ['F'] })));
    act(() =>
      vis.onSelectionChange({
        [uuid]: point({ sex: ['M'], race: ['Asian'] }),
        other_chart: point({ x: ['1'] }),
      }),
    );
    act(frame);
    expect(filters.getState().dataSelections['col:donors.sex']).toEqual(point({ sex: ['F'] }));
  });

  it('writes only the latest of the reports made within one frame', () => {
    act(() => vis.onSelectionChange({ [uuid]: point({}) }));
    act(() => {
      vis.onSelectionChange({ [uuid]: point({ sex: ['M'] }) });
      vis.onSelectionChange({ [uuid]: point({ sex: ['F'] }) });
    });
    expect(filters.getState().dataSelections).toEqual({});
    expect(frames).toHaveLength(1);
    act(frame);
    expect(filters.getState().dataSelections).toEqual({ 'col:donors.sex': point({ sex: ['F'] }) });
  });
});
