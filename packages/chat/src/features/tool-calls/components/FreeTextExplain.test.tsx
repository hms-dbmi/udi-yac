/**
 * @vitest-environment jsdom
 *
 * Values the agent computed from the data read as data, not as bold text (#28).
 */
import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UDIChatProvider, useDataPackageStore } from '@/app/UDIChatContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MarkdownText } from '@/components/MarkdownText';
import { FreeTextExplain } from './FreeTextExplain';

type DataPackageStore = ReturnType<typeof useDataPackageStore>;

function Probe({ onStore }: { onStore: (s: DataPackageStore) => void }) {
  onStore(useDataPackageStore());
  return null;
}

describe('FreeTextExplain', () => {
  it('marks a computed value and shows its label on hover', async () => {
    render(
      <UDIChatProvider>
        <TooltipProvider>
          <FreeTextExplain
            response_type="data_summary"
            has_structured_elements
            text={[
              '- **datasets**: ',
              {
                expression: '{row_count("datasets")}',
                label: 'row count of datasets',
                value: '6537',
              },
              ' rows; first field ',
              { expression: '{x()}', label: 'odd [label] "quoted"', value: 'donor_id*' },
            ]}
          />
        </TooltipProvider>
      </UDIChatProvider>,
    );

    const value = screen.getByText('6537');
    expect(value.closest('strong')).toBeNull();
    expect(value.closest('a')).toBeNull();
    // Inside the list item, and markdown punctuation in a value stays literal.
    expect(value.closest('li')).not.toBeNull();
    expect(screen.getByText('donor_id*')).toBeTruthy();

    await userEvent.hover(value);
    expect(await screen.findByText('row count of datasets')).toBeTruthy();
    await userEvent.hover(screen.getByText('donor_id*'));
    expect(await screen.findByText('odd [label] "quoted"')).toBeTruthy();
  });

  it('leaves a typed data-value link a plain link', () => {
    render(
      <UDIChatProvider>
        {/* A user's own message, and the model's own text in an explain reply. */}
        <MarkdownText>{'[5](#udi-data-value "row count")'}</MarkdownText>
        <FreeTextExplain
          response_type="general"
          has_structured_elements={false}
          text={['[999](#udi-data-value "row count of datasets")']}
        />
      </UDIChatProvider>,
    );
    expect(screen.getByText('5').closest('a')).not.toBeNull();
    expect(screen.getByText('999').closest('a')).not.toBeNull();
  });

  it('gives each table in a list of entity names its own tooltip', async () => {
    let store!: DataPackageStore;
    render(
      <UDIChatProvider>
        <TooltipProvider>
          <Probe onStore={(s) => (store = s)} />
          <FreeTextExplain
            response_type="data_summary"
            has_structured_elements
            text={[
              'Tables: ',
              { expression: '{entity_names()}', label: 'entity names', value: 'donors, samples' },
            ]}
          />
        </TooltipProvider>
      </UDIChatProvider>,
    );
    // Before the package loads, the list stays one value.
    expect(screen.getByText('donors, samples')).toBeTruthy();

    act(() => {
      store.setState({
        dataPackage: {
          name: 'p',
          'udi:path': '',
          resources: [
            {
              name: 'donors',
              path: '',
              schema: { fields: [] },
              description: 'One row per donor.',
              'udi:row_count': 6537,
              'udi:column_count': 39,
            },
            {
              name: 'samples',
              path: '',
              schema: { fields: [] },
              'udi:row_count': 10,
              'udi:hide_count': true,
              'udi:column_count': 5,
            },
          ],
        },
      });
    });

    await userEvent.hover(screen.getByText('donors'));
    expect(await screen.findByText('One row per donor. · 6,537 rows × 39 columns')).toBeTruthy();
    await userEvent.hover(screen.getByText('samples'));
    expect(await screen.findByText('5 columns')).toBeTruthy();
  });
});
