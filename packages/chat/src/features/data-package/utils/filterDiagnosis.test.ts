/**
 * Modelled on the reported failure: "Filter to datasets with assay type =
 * xenium". Fixtures are self-contained rather than read from `sample-data/`,
 * so upstream schema churn can't silently rewrite what these assert — HuBMAP
 * has since dropped `assay_type` and moved Xenium into `dataset_type`, which
 * is exactly the cross-field hint the no-match case below covers. Graceful
 * degradation to "nothing matched anywhere" is the common case, not the
 * exception.
 */
import { describe, it, expect } from 'vitest';
import { diagnoseFilter, normalizePointValues } from './filterDiagnosis';
import type { FilterDiagnosisContext } from './filterDiagnosis';
import type { DataFieldDomain } from '@/types/dataPackage';

const sourceFields = {
  datasets: ['assay_type', 'dataset_type', 'file_size', 'uuid'],
  donors: ['sex'],
};

function point(entity: string, field: string, values: (string | null)[]): DataFieldDomain {
  return { entity, field, type: 'point', fieldDescription: '', domain: { values } as never };
}

const assayType = point('datasets', 'assay_type', ['AF', 'CODEX', 'Cell DIVE', 'MIBI', '']);
const datasetType = point('datasets', 'dataset_type', ['Xenium', 'RNAseq']);
const fileSize: DataFieldDomain = {
  entity: 'datasets',
  field: 'file_size',
  type: 'interval',
  fieldDescription: '',
  domain: { min: 0, max: 4_100_000_000 },
};
const donorSex = point('donors', 'sex', ['Male', 'Female']);

/** `uuid` is deliberately absent from every fixture: in schema, no domain. */
function ctx(domains: DataFieldDomain[]): FilterDiagnosisContext {
  return {
    sourceFields,
    entityNames: ['datasets', 'donors'],
    dataFieldDomains: domains,
    loadingPhase: 'ready',
  };
}

const full = ctx([assayType, datasetType, fileSize, donorSex]);
/** The real HuBMAP shape: "Xenium" exists nowhere in the package. */
const noXeniumAnywhere = ctx([assayType, fileSize, donorSex]);

describe('normalizePointValues', () => {
  it('collapses the agent\'s [""] default and a cleared widget to nothing', () => {
    expect(normalizePointValues(undefined)).toEqual([]);
    expect(normalizePointValues([])).toEqual([]);
    expect(normalizePointValues([''])).toEqual([]);
    expect(normalizePointValues([null])).toEqual([]);
    expect(normalizePointValues(['  '])).toEqual([]);
  });

  it('keeps real values and stringifies them', () => {
    expect(normalizePointValues(['CODEX', 42])).toEqual(['CODEX', '42']);
  });
});

describe('diagnoseFilter — the reported Xenium case', () => {
  it("reports no-match and offers the field's real values", () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['Xenium'] },
      noXeniumAnywhere,
    );
    expect(d.kind).toBe('no-match');
    if (d.kind !== 'no-match') throw new Error('unreachable');
    expect(d.missing).toEqual(['Xenium']);
    expect(d.nearby).toEqual([]);
    expect(d.otherFields).toEqual([]);
    // Blank stripped for display even though it IS a real distinct value.
    expect(d.options).toEqual(['AF', 'CODEX', 'Cell DIVE', 'MIBI']);
  });

  it('points at the field that does contain the value', () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['Xenium'] },
      full,
    );
    if (d.kind !== 'no-match') throw new Error('expected no-match');
    expect(d.otherFields).toEqual([
      { entity: 'datasets', field: 'dataset_type', value: 'Xenium', sameEntity: true },
    ]);
  });
});

describe('diagnoseFilter — near misses', () => {
  it('flags a pure capitalisation miss as via:"case"', () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['codex'] },
      full,
    );
    if (d.kind !== 'no-match') throw new Error('expected no-match');
    expect(d.nearby).toEqual([{ value: 'CODEX', via: 'case' }]);
  });

  it('matches substrings in either direction', () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['CODEX-2'] },
      full,
    );
    if (d.kind !== 'no-match') throw new Error('expected no-match');
    expect(d.nearby).toEqual([{ value: 'CODEX', via: 'substring' }]);
  });

  it('orders case matches before substring matches', () => {
    const domain = point('datasets', 'assay_type', ['cell dive', 'Cell DIVE 2']);
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['Cell DIVE'] },
      ctx([domain]),
    );
    if (d.kind !== 'no-match') throw new Error('expected no-match');
    expect(d.nearby.map((n) => n.via)).toEqual(['case', 'substring']);
  });
});

describe('diagnoseFilter — partial match', () => {
  it('separates the values that exist from the invented one', () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['CODEX', 'Xenium'] },
      noXeniumAnywhere,
    );
    expect(d.kind).toBe('partial-match');
    if (d.kind !== 'partial-match') throw new Error('unreachable');
    expect(d.present).toEqual(['CODEX']);
    expect(d.missing).toEqual(['Xenium']);
  });
});

describe('diagnoseFilter — schema misses', () => {
  it('reports unknown-field with similarly named fields', () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_typ', kind: 'point', values: ['CODEX'] },
      full,
    );
    expect(d.kind).toBe('unknown-field');
    if (d.kind !== 'unknown-field') throw new Error('unreachable');
    expect(d.nearbyFields).toEqual(['assay_type']);
  });

  it('reports unknown-entity with similarly named entities', () => {
    const d = diagnoseFilter(
      { entity: 'dataset', field: 'assay_type', kind: 'point', values: ['CODEX'] },
      full,
    );
    expect(d.kind).toBe('unknown-entity');
    if (d.kind !== 'unknown-entity') throw new Error('unreachable');
    expect(d.nearbyEntities).toEqual(['datasets']);
  });
});

describe('diagnoseFilter — unverifiable, not invalid', () => {
  it('treats a field with no domain as unverifiable (remote >80-distinct drop)', () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'uuid', kind: 'point', values: ['abc123'] },
      full,
    );
    expect(d).toEqual({
      kind: 'unverifiable',
      entity: 'datasets',
      field: 'uuid',
      reason: 'no-domain',
    });
  });

  it('treats a point filter on a quantitative field as unverifiable', () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'file_size', kind: 'point', values: ['5'] },
      full,
    );
    if (d.kind !== 'unverifiable') throw new Error('expected unverifiable');
    expect(d.reason).toBe('wrong-domain-type');
  });

  it('treats an interval filter on a categorical field as unverifiable', () => {
    const d = diagnoseFilter({ entity: 'datasets', field: 'assay_type', kind: 'interval' }, full);
    if (d.kind !== 'unverifiable') throw new Error('expected unverifiable');
    expect(d.reason).toBe('wrong-domain-type');
  });

  it('accepts an interval filter on a real interval field', () => {
    expect(
      diagnoseFilter({ entity: 'datasets', field: 'file_size', kind: 'interval' }, full),
    ).toEqual({
      kind: 'ok',
    });
  });
});

describe('diagnoseFilter — empty and loading', () => {
  it.each([[[]], [['']], [[null]], [['  ']], [undefined]])(
    'treats %j as empty-request, never a miss',
    (values) => {
      const d = diagnoseFilter(
        { entity: 'datasets', field: 'assay_type', kind: 'point', values: values as never },
        full,
      );
      expect(d.kind).toBe('empty-request');
    },
  );

  it('accepts values that are really in the domain', () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['CODEX', 'MIBI'] },
      full,
    );
    expect(d).toEqual({ kind: 'ok' });
  });

  it('accepts a null value that the domain genuinely contains', () => {
    const withNull = point('datasets', 'assay_type', ['AF', null]);
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: [null] },
      ctx([withNull]),
    );
    // null normalizes away, so this reads as "no values requested", not a miss.
    expect(d.kind).toBe('empty-request');
    if (d.kind !== 'empty-request') throw new Error('unreachable');
    expect(d.options).toEqual(['AF']);
  });

  it('withholds a verdict until domains have landed', () => {
    for (const loadingPhase of ['idle', 'fetching', 'domains'] as const) {
      expect(
        diagnoseFilter(
          { entity: 'nope', field: 'nope', kind: 'point', values: ['x'] },
          { ...full, loadingPhase },
        ),
      ).toEqual({ kind: 'loading' });
    }
    expect(
      diagnoseFilter(
        { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['Xenium'] },
        { ...full, sourceFields: null },
      ),
    ).toEqual({ kind: 'loading' });
  });
});

describe('diagnoseFilter — cross-field search', () => {
  it('caps hits and puts same-entity matches first', () => {
    const domains = [
      assayType,
      point('donors', 'a', ['Xenium']),
      point('donors', 'b', ['Xenium']),
      point('datasets', 'c', ['Xenium']),
      point('datasets', 'd', ['Xenium']),
      point('datasets', 'e', ['Xenium']),
    ];
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['Xenium'] },
      ctx(domains),
    );
    if (d.kind !== 'no-match') throw new Error('expected no-match');
    expect(d.otherFields).toHaveLength(3);
    expect(d.otherFields.every((f) => f.sameEntity)).toBe(true);
    expect(d.otherFields.map((f) => f.field)).toEqual(['c', 'd', 'e']);
  });

  it("matches case-insensitively and reports the domain's own spelling", () => {
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['XENIUM'] },
      full,
    );
    if (d.kind !== 'no-match') throw new Error('expected no-match');
    expect(d.otherFields[0].value).toBe('Xenium');
  });

  it('scans a large domain without truncating it away', () => {
    const many = Array.from({ length: 100_000 }, (_, i) => `id-${i}`);
    const d = diagnoseFilter(
      { entity: 'datasets', field: 'assay_type', kind: 'point', values: ['id-99999'] },
      ctx([assayType, point('datasets', 'uuid', many)]),
    );
    if (d.kind !== 'no-match') throw new Error('expected no-match');
    expect(d.otherFields).toEqual([
      { entity: 'datasets', field: 'uuid', value: 'id-99999', sameEntity: true },
    ]);
  });
});
