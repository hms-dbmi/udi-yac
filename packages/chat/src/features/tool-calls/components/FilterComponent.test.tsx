/**
 * @vitest-environment jsdom
 *
 * The reported bug: asking to "filter datasets with assay type = xenium"
 * against HuBMAP rendered an EMPTY chat bubble. `syncFiltersFromMessages`
 * refused the filter because "Xenium" isn't in `assay_type`'s domain, so no
 * dataSelection existed and FilterComponent returned null — leaving a message
 * with empty content and nothing else to draw.
 *
 * The model only ever sees ~5 sampled values per field, so it will keep naming
 * values that don't exist; the card has to explain the miss and offer a fix.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import {
  UDIChatProvider,
  useDataPackage,
  useDataPackageStore,
  useDataFiltersStore,
} from '@/app/UDIChatContext';
import { FilterComponent } from './FilterComponent';
import type { Message } from '@/types/messages';
import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';
import type { StoreApi } from 'zustand/vanilla';
import type { DataFiltersState } from '@/features/dashboard';

const pkg = {
  'udi:path': 'data',
  resources: [
    {
      name: 'datasets',
      path: 'datasets.csv',
      'udi:row_count': 9474,
      schema: {
        fields: [
          { name: 'assay_type', 'udi:data_type': 'nominal' },
          { name: 'dataset_type', 'udi:data_type': 'nominal' },
          { name: 'file_size', 'udi:data_type': 'quantitative' },
          // In the schema but deliberately never given a domain — the shape a
          // remote package produces for a >80-distinct column.
          { name: 'uuid', 'udi:data_type': 'nominal' },
        ],
      },
    },
  ],
} as unknown as DataPackage;

const assayType: DataFieldDomain = {
  entity: 'datasets',
  field: 'assay_type',
  type: 'point',
  fieldDescription: '',
  domain: { values: ['AF', 'CODEX', 'Cell DIVE', 'MIBI'] },
};
const datasetType: DataFieldDomain = {
  entity: 'datasets',
  field: 'dataset_type',
  type: 'point',
  fieldDescription: '',
  domain: { values: ['Xenium', 'RNAseq'] },
};

let filters: StoreApi<DataFiltersState>;

function Harness({
  domains,
  messages,
  children,
}: {
  domains: DataFieldDomain[];
  messages: Message[];
  children: ReactNode;
}) {
  const dataPackageStore = useDataPackageStore();
  const dataFiltersStore = useDataFiltersStore();
  // Gate on a STORE value: the widgets below subscribe to stable function
  // slices and would not re-render on a post-mount store update.
  const loadingPhase = useDataPackage((s) => s.loadingPhase);
  useEffect(() => {
    filters = dataFiltersStore;
    dataPackageStore.setState({
      dataPackage: pkg,
      dataFieldDomains: domains,
      sourceFields: { datasets: ['assay_type', 'dataset_type', 'file_size', 'uuid'] },
      categoricalSourceFields: { datasets: ['assay_type', 'dataset_type', 'uuid'] },
      quantitativeSourceFields: { datasets: ['file_size'] },
      entityNames: ['datasets'],
      loadingPhase: 'ready',
    });
    // Mirrors UDIChat's own sync effect, so these tests exercise admission and
    // rendering together — the two must agree or a filter renders a populated
    // widget while filtering nothing.
    const dp = dataPackageStore.getState();
    dataFiltersStore.getState().syncFiltersFromMessages(messages, {
      isValidIntervalFilter: dp.isValidIntervalFilter,
      isValidPointFilter: dp.isValidPointFilter,
    });
  }, [dataPackageStore, dataFiltersStore, domains, messages]);
  return loadingPhase === 'ready' ? <>{children}</> : null;
}

function filterMessage(
  entity: string,
  field: string,
  pointValues: string[],
  filterType: 'point' | 'interval' = 'point',
): Message {
  return {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        function: {
          name: 'FilterData',
          arguments: {
            title: 'Dataset Assay Type',
            entity,
            field,
            filter: { filterType, intervalRange: { min: 0, max: 0 }, pointValues },
          } as never,
        },
      },
    ],
  };
}

function renderFilter(message: Message, domains: DataFieldDomain[] = [assayType]) {
  return render(
    <UDIChatProvider>
      <Harness domains={domains} messages={[message]}>
        <FilterComponent message={message} messageIndex={0} toolCallIndex={0} />
      </Harness>
    </UDIChatProvider>,
  );
}

describe('FilterComponent — a filter the data cannot satisfy', () => {
  it('renders something rather than an empty bubble', () => {
    const { container } = renderFilter(filterMessage('datasets', 'assay_type', ['Xenium']));
    expect(container.textContent).not.toBe('');
    expect(screen.getByText(/no matching values/i)).toBeTruthy();
    expect(screen.getByText(/has no value "Xenium"/)).toBeTruthy();
  });

  it("offers the field's real values as a picker", () => {
    renderFilter(filterMessage('datasets', 'assay_type', ['Xenium']));
    for (const value of ['AF', 'CODEX', 'Cell DIVE', 'MIBI']) {
      expect(screen.getByRole('checkbox', { name: value })).toBeTruthy();
    }
  });

  it('points at the field that does contain the value', () => {
    renderFilter(filterMessage('datasets', 'assay_type', ['Xenium']), [assayType, datasetType]);
    expect(screen.getByText('dataset_type')).toBeTruthy();
  });

  it('degrades gracefully when the value exists nowhere in the package', () => {
    renderFilter(filterMessage('datasets', 'assay_type', ['Xenium']));
    expect(screen.queryByText('dataset_type')).toBeNull();
    expect(screen.queryByText(/does appear in/)).toBeNull();
    // The real values are still offered — that's the whole recovery path.
    expect(screen.getByRole('checkbox', { name: 'CODEX' })).toBeTruthy();
  });

  it('repairs the filter in one click, and the notice retires', () => {
    renderFilter(filterMessage('datasets', 'assay_type', ['Xenium']));
    fireEvent.click(screen.getByRole('checkbox', { name: 'CODEX' }));

    expect(filters.getState().dataSelections['message-filter-0-0']).toEqual({
      dataSourceKey: 'datasets',
      type: 'point',
      selection: { assay_type: ['CODEX'] },
    });
    expect(screen.queryByText(/no matching values/i)).toBeNull();
    // The genuine widget has taken over (tweakable => entity/field selects).
    expect(screen.getByRole('checkbox', { name: 'CODEX' })).toBeTruthy();
  });

  it('names the requested field when the field itself does not exist', () => {
    renderFilter(filterMessage('datasets', 'assay_typ', ['CODEX']));
    expect(screen.getByText(/has no field/)).toBeTruthy();
    // Two hints legitimately point at the same field: "did you mean
    // assay_type?" and "CODEX does appear in assay_type".
    expect(screen.getAllByRole('button', { name: 'assay_type' }).length).toBeGreaterThan(0);
  });

  it('renders the working widget, not the notice, when it cannot verify', () => {
    // `uuid` is in the schema with no domain — the remote >80-distinct shape.
    renderFilter(filterMessage('datasets', 'uuid', ['abc123']));
    expect(screen.queryByText(/no matching values/i)).toBeNull();
    expect(screen.getByText('abc123')).toBeTruthy();
  });

  it('explains an interval filter on a field that does not exist', () => {
    const { container } = renderFilter(filterMessage('datasets', 'no_such_number', [], 'interval'));
    expect(container.textContent).not.toBe('');
    expect(screen.getByText(/has no field/)).toBeTruthy();
  });
});

describe('FilterComponent — filters the data can satisfy', () => {
  it('keeps the working widget when the user unticks the last value', () => {
    renderFilter(filterMessage('datasets', 'assay_type', ['CODEX']));
    // The genuine widget is showing, with CODEX ticked.
    const codex = screen.getByRole('checkbox', { name: 'CODEX' });
    expect(screen.queryByText(/no matching values/i)).toBeNull();

    fireEvent.click(codex);

    expect(filters.getState().dataSelections['message-filter-0-0'].selection).toEqual({
      assay_type: [],
    });
    // An empty selection is mid-interaction, not a failure — the widget must
    // not be replaced by the notice.
    expect(screen.queryByText(/no matching values/i)).toBeNull();
    expect(screen.queryByText(/no values chosen/i)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'CODEX' })).toBeTruthy();
  });
});
