import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OTHER_LABEL,
  addCut,
  assignValue,
  equalWidthCuts,
  groupingLabels,
  moveCut,
  nextGroupLabel,
  parseGrouping,
  quantitativeLabels,
  serializeGrouping,
  unassignedValues,
  type NominalGrouping,
} from './grouping';

describe('parseGrouping', () => {
  it('reads "not grouped" out of every spelling of absent', () => {
    for (const raw of [undefined, null, '', '   ']) {
      expect(parseGrouping(raw)).toBeNull();
    }
  });

  it('falls back to ungrouped rather than throwing on a malformed payload', () => {
    // A control that won't render because the stored value is broken leaves the
    // user no way to fix it.
    expect(parseGrouping('{"type": "nominal",')).toBeNull();
    expect(parseGrouping('"a string"')).toBeNull();
    expect(parseGrouping('{"type": "nominal", "groups": []}')).toBeNull();
  });

  it('round-trips a nominal grouping', () => {
    const raw =
      '{"type":"nominal","groups":[{"label":"White","values":["White"]}],"other":"Other"}';
    const parsed = parseGrouping(raw);
    expect(parsed).toEqual({
      type: 'nominal',
      groups: [{ label: 'White', values: ['White'] }],
      other: 'Other',
    });
    expect(parseGrouping(serializeGrouping(parsed))).toEqual(parsed);
  });

  it('reads an explicit null "other" as "leave them out"', () => {
    const parsed = parseGrouping(
      '{"type":"nominal","groups":[{"label":"A","values":["a"]}],"other":null}',
    );
    expect((parsed as NominalGrouping).other).toBeNull();
  });

  it('defaults a missing "other" to the Other bucket', () => {
    const parsed = parseGrouping('{"type":"nominal","groups":[{"label":"A","values":["a"]}]}');
    expect((parsed as NominalGrouping).other).toBe(DEFAULT_OTHER_LABEL);
  });

  it('sorts cut points it is handed out of order', () => {
    expect(parseGrouping('{"type":"quantitative","cuts":[65,50]}')).toEqual({
      type: 'quantitative',
      cuts: [50, 65],
    });
  });
});

describe('serializeGrouping', () => {
  it('spells ungrouped as the empty string', () => {
    // Which is what the tool argument carries, since it is a string parameter.
    expect(serializeGrouping(null)).toBe('');
  });
});

describe('quantitativeLabels', () => {
  it('gives one more label than there are cuts, half-open on the right', () => {
    expect(quantitativeLabels([65])).toEqual(['< 65', '≥ 65']);
    expect(quantitativeLabels([50, 65])).toEqual(['< 50', '50–65', '≥ 65']);
  });

  it('does not decorate an integer cut with a decimal point', () => {
    expect(quantitativeLabels([65.0])).toEqual(['< 65', '≥ 65']);
  });
});

describe('groupingLabels', () => {
  it('counts Other as a stratum, because it is drawn as one', () => {
    expect(
      groupingLabels({
        type: 'nominal',
        groups: [{ label: 'A', values: ['a'] }],
        other: 'Other',
      }),
    ).toEqual(['A', 'Other']);
  });

  it('omits Other when unassigned values are dropped', () => {
    expect(
      groupingLabels({ type: 'nominal', groups: [{ label: 'A', values: ['a'] }], other: null }),
    ).toEqual(['A']);
  });
});

describe('assignValue', () => {
  const base: NominalGrouping = {
    type: 'nominal',
    groups: [
      { label: 'A', values: ['x'] },
      { label: 'B', values: [] },
    ],
    other: 'Other',
  };

  it('moves a value rather than copying it', () => {
    // Overlapping groups are not a partition, and the agent refuses them.
    const moved = assignValue(base, 'x', 'B');
    expect(moved.groups).toEqual([
      { label: 'A', values: [] },
      { label: 'B', values: ['x'] },
    ]);
  });

  it('unassigns on a null target', () => {
    expect(assignValue(base, 'x', null).groups[0].values).toEqual([]);
  });

  it('is idempotent', () => {
    expect(assignValue(assignValue(base, 'x', 'B'), 'x', 'B').groups[1].values).toEqual(['x']);
  });
});

describe('unassignedValues', () => {
  it('is everything no group has claimed — what Other would hold', () => {
    const grouping: NominalGrouping = {
      type: 'nominal',
      groups: [{ label: 'White', values: ['White'] }],
      other: 'Other',
    };
    expect(unassignedValues(grouping, ['White', 'Black', 'Asian'])).toEqual(['Black', 'Asian']);
  });
});

describe('nextGroupLabel', () => {
  it('skips a name already taken, so two groups are never both "Group 2"', () => {
    const grouping: NominalGrouping = {
      type: 'nominal',
      groups: [{ label: 'Group 1', values: [] }],
      other: null,
    };
    expect(nextGroupLabel(grouping)).toBe('Group 2');
  });
});

describe('cut point editing', () => {
  it('keeps the list ascending as a handle is dragged past its neighbour', () => {
    expect(moveCut([50, 65], 0, 80)).toEqual([65, 80]);
  });

  it('refuses a duplicate, which would make an empty bucket', () => {
    expect(addCut([65], 65)).toEqual([65]);
  });

  it('rounds off the float noise a drag produces', () => {
    // The agent would accept 64.99999999999999 and put it in a bucket label.
    expect(addCut([], 64.999999999999996)).toEqual([65]);
  });

  it('splits a range into equally wide buckets', () => {
    expect(equalWidthCuts(0, 100, 2)).toEqual([50]);
    expect(equalWidthCuts(0, 100, 4)).toEqual([25, 50, 75]);
  });

  it('has nothing to split when the range is empty or degenerate', () => {
    expect(equalWidthCuts(5, 5, 2)).toEqual([]);
    expect(equalWidthCuts(0, 100, 1)).toEqual([]);
  });
});
