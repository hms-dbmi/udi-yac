/**
 * Which controls a chart offers, and where their options come from.
 *
 * Two modes, and they are exclusive. A spec the agent generated from a template
 * is described by the template's parameters, because a re-bind resolves the
 * template again. Anything else is described by reading the finished spec back,
 * which is all a hand-written spec offers to go on.
 */
import { describe, it, expect } from 'vitest';
import { computeTweakableParams, hasTweakableFields } from './tweakability';
import type { TemplateProvenance } from '../stores/dashboardStore';
import type { UDIGrammar } from 'udi-toolkit/react';

/** Mirrors the survival templates: every axis is a column the spec derives. */
function survivalSpec(): UDIGrammar {
  return {
    source: { name: 'Event', source: 'events.csv' },
    transformation: [{ groupby: 'organization_name' }],
    representation: [
      {
        mark: 'line',
        mapping: [
          { encoding: 'x', field: 'survival days', type: 'quantitative' },
          { encoding: 'y', field: 'survival percentage', type: 'quantitative' },
          { encoding: 'color', field: 'organization_name', type: 'nominal' },
        ],
      },
      {
        mark: 'text',
        mapping: [
          { encoding: 'x', field: 'label day', type: 'quantitative' },
          { encoding: 'y', field: 'final percentage', type: 'quantitative' },
          { encoding: 'text', field: 'final label', type: 'nominal' },
          { encoding: 'color', field: 'organization_name', type: 'nominal' },
        ],
      },
    ],
  } as unknown as UDIGrammar;
}

function provenance(overrides: Partial<TemplateProvenance['params'][0]> = {}): TemplateProvenance {
  return {
    tool: 'vis_053_line_survival',
    toolArgs: { entity: 'Event', field4: 'organization_name' },
    params: [
      {
        param: 'field4',
        placeholder: 'F4',
        entity: 'Event',
        type: 'nominal',
        encodings: ['color'],
        label: 'color',
        value: 'organization_name',
        ...overrides,
      },
    ],
  };
}

// Two entities, so a lookup against the wrong one is visible rather than lucky.
const SOURCE_FIELDS = {
  Event: ['organization_name', 'event_type', 'event_date', 'research_id'],
  Patient: ['sex', 'vital_status'],
};
const CATEGORICAL = {
  Event: ['organization_name', 'event_type', 'research_id'],
  Patient: ['sex', 'vital_status'],
};
const QUANTITATIVE = { Event: ['event_date'], Patient: [] as string[] };

const compute = (spec: UDIGrammar, template?: TemplateProvenance) =>
  computeTweakableParams(spec, SOURCE_FIELDS, QUANTITATIVE, CATEGORICAL, template);

describe('computeTweakableParams — template (binding) mode', () => {
  it('offers one control per template parameter, labelled by what it drives', () => {
    const params = compute(survivalSpec(), provenance());
    expect(params).toEqual([
      {
        kind: 'binding',
        param: 'field4',
        placeholder: 'F4',
        field: 'organization_name',
        label: 'color',
        options: CATEGORICAL.Event,
      },
    ]);
  });

  it('takes options from the descriptor’s entity, not the spec’s first source', () => {
    // A join template binds a field on the second entity; only the descriptor
    // knows which one, so a lookup keyed on the spec's source would be wrong.
    const params = compute(survivalSpec(), provenance({ entity: 'Patient', value: 'sex' }));
    expect(params[0].options).toEqual(CATEGORICAL.Patient);
  });

  it('follows the required field type', () => {
    expect(compute(survivalSpec(), provenance({ type: 'quantitative' }))[0].options).toEqual([
      'organization_name',
      ...QUANTITATIVE.Event,
    ]);
    // Unconstrained: anything on the entity is fair game.
    expect(compute(survivalSpec(), provenance({ type: null }))[0].options).toEqual(
      SOURCE_FIELDS.Event,
    );
  });

  it('always includes the bound field, even when the schema disagrees about it', () => {
    // A Select whose value is absent from its items renders blank, which reads
    // as a broken control rather than as a schema disagreement.
    const params = compute(survivalSpec(), provenance({ value: 'not_in_schema' }));
    expect(params[0].field).toBe('not_in_schema');
    expect(params[0].options[0]).toBe('not_in_schema');
  });

  it('ignores the spec heuristics entirely while in binding mode', () => {
    // `organization_name` is a groupby field in the raw schema, so the heuristic
    // path would classify it as a 'dimension' and rewrite the spec to swap it.
    const params = compute(survivalSpec(), provenance());
    expect(params).toHaveLength(1);
    expect(params[0].kind).toBe('binding');
  });

  it('exists as far as the gear button is concerned, with no option lists loaded', () => {
    expect(hasTweakableFields(survivalSpec(), SOURCE_FIELDS, provenance())).toBe(true);
  });
});

describe('computeTweakableParams — falling back to the spec heuristics', () => {
  it('offers nothing for a template spec whose axes are all derived', () => {
    // The reason this feature needed the template: with no provenance, every
    // encoding here is a column the spec computes, so none can be swapped by
    // rewriting — and the one that could (color) would corrupt the rest.
    const params = compute(survivalSpec());
    expect(params.map((p) => p.field)).toEqual(['organization_name']);
    expect(params[0].kind).toBe('dimension');
  });

  it('is used when provenance carries no offerable parameters', () => {
    const empty: TemplateProvenance = { ...provenance(), params: [] };
    expect(compute(survivalSpec(), empty)[0].kind).toBe('dimension');
  });

  it('still labels heuristic controls by their encoding', () => {
    const spec = {
      source: { name: 'Event', source: 'events.csv' },
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'event_date', type: 'quantitative' },
          { encoding: 'color', field: 'event_type', type: 'nominal' },
        ],
      },
    } as unknown as UDIGrammar;
    expect(compute(spec).map((p) => [p.label, p.field])).toEqual([
      ['x', 'event_date'],
      ['color', 'event_type'],
    ]);
  });
});
