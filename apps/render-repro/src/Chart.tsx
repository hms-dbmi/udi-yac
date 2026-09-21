import { useState } from 'react';
import { UDIVis, type DataSelections, type UDIGrammar } from 'udi-toolkit/react';

/**
 * One chart, with its row count on show.
 *
 * The count is not decoration: this bug's whole signature is "the data is right
 * and the picture is wrong", so the two have to be readable side by side. It
 * comes from `UDIVis`'s own `onDataReady`, i.e. the rows the chart itself holds.
 */
export function Chart({
  title,
  spec,
  selections,
  onSelectionChange,
}: {
  title: string;
  spec: UDIGrammar;
  selections: DataSelections;
  /** Fires when a brush inside this chart moves — the other half of the binding. */
  onSelectionChange?: (selections: DataSelections) => void;
}) {
  const [rows, setRows] = useState<number | null>(null);

  return (
    <section
      style={{
        background: '#fff',
        border: '1px solid #e3e3e0',
        borderRadius: 8,
        padding: 12,
        width: 560,
      }}
    >
      <h2 style={{ fontSize: 13, margin: '0 0 8px', display: 'flex', gap: 8 }}>
        <span>{title}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 400, color: '#6b6b66' }}>
          {rows ?? '…'} rows
        </span>
      </h2>
      {/* A definite height, which `height: container` needs to resolve against. */}
      <div style={{ height: 280 }}>
        <UDIVis
          spec={spec}
          selections={selections}
          fillContainer
          onDataReady={({ data }) => setRows(data?.length ?? 0)}
          {...(onSelectionChange ? { onSelectionChange } : {})}
          style={{ display: 'block', height: '100%', width: '100%' }}
        />
      </div>
    </section>
  );
}
