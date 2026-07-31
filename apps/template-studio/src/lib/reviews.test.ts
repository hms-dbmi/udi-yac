import { describe, expect, it } from 'vitest';
import {
  countByStatus,
  filterTemplates,
  findOrphanedReviews,
  statusFor,
  feedbackFor,
} from './reviews';
import type { ReviewMap, TemplateRecord } from '@/types/previews';

function template(overrides: Partial<TemplateRecord> = {}): TemplateRecord {
  return {
    key: 'aaaaaaaaaaaa',
    index: 0,
    toolName: 'vis_000_barchart_basic',
    toolDescription: '',
    bindingKeys: ['E', 'F'],
    chartType: 'barchart',
    chartComplexity: 'simple',
    tags: ['line_item', 'barchart'],
    description: 'Counts entities grouped by a nominal field.',
    designConsiderations: '',
    tasks: '',
    taskTypes: [],
    queryTemplates: [],
    reviewHint: '',
    specTemplate: '{}',
    templateGrammarError: '',
    previews: { hubmap: { status: 'ok', bindings: { E: 'donors' }, spec: {} as never } },
    ...overrides,
  };
}

describe('statusFor / feedbackFor', () => {
  it('defaults a template with no review entry to "new"', () => {
    expect(statusFor('missing', {})).toBe('new');
    expect(feedbackFor('missing', {})).toBe('');
  });

  it('reads a stored entry', () => {
    const reviews: ReviewMap = {
      abc: { status: 'approved', feedback: 'looks good', reviewed_at: '2026-01-01T00:00:00Z' },
    };
    expect(statusFor('abc', reviews)).toBe('approved');
    expect(feedbackFor('abc', reviews)).toBe('looks good');
  });
});

describe('findOrphanedReviews', () => {
  it('surfaces entries whose template is gone rather than dropping them', () => {
    const templates = [template({ key: 'live00000000' })];
    const reviews: ReviewMap = {
      live00000000: { status: 'approved', feedback: '', reviewed_at: '2026-01-01T00:00:00Z' },
      dead00000000: {
        status: 'needs_changes',
        feedback: 'axis labels overlap',
        reviewed_at: '2026-01-01T00:00:00Z',
      },
    };

    const orphans = findOrphanedReviews(templates, reviews);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].key).toBe('dead00000000');
    // The feedback must survive, since it's the reason to keep the orphan visible.
    expect(orphans[0].entry.feedback).toBe('axis labels overlap');
  });

  it('returns nothing when every review matches a template', () => {
    const templates = [template({ key: 'k1' }), template({ key: 'k2' })];
    const reviews: ReviewMap = {
      k1: { status: 'approved', feedback: '', reviewed_at: '' },
      k2: { status: 'rejected', feedback: '', reviewed_at: '' },
    };
    expect(findOrphanedReviews(templates, reviews)).toEqual([]);
  });
});

describe('countByStatus', () => {
  it('counts unreviewed templates as new', () => {
    const templates = [template({ key: 'k1' }), template({ key: 'k2' }), template({ key: 'k3' })];
    const reviews: ReviewMap = { k1: { status: 'approved', feedback: '', reviewed_at: '' } };

    expect(countByStatus(templates, reviews)).toEqual({
      total: 3,
      new: 2,
      approved: 1,
      rejected: 0,
      needs_changes: 0,
    });
  });
});

describe('filterTemplates', () => {
  const templates = [
    template({ key: 'k1', toolName: 'vis_000_barchart_basic', chartType: 'barchart' }),
    template({
      key: 'k2',
      toolName: 'vis_010_heatmap_basic',
      chartType: 'heatmap',
      description: 'A heatmap of two nominal fields.',
      tags: ['line_item', 'heatmap'],
    }),
    template({
      key: 'k3',
      toolName: 'vis_020_barchart_cube',
      tags: ['data_cube', 'barchart'],
      previews: { hubmap: { status: 'shape_mismatch', reason: 'cube template' } },
    }),
  ];
  const base = {
    statuses: new Set<never>(),
    search: '',
    renderableOnly: false,
    dataPackageId: 'hubmap',
  };

  it('returns everything when unfiltered', () => {
    expect(filterTemplates(templates, {}, base)).toHaveLength(3);
  });

  it('filters to templates that render against the selected package', () => {
    const result = filterTemplates(templates, {}, { ...base, renderableOnly: true });
    expect(result.map((t) => t.key)).toEqual(['k1', 'k2']);
  });

  it('matches search across name, description, chart type and tags', () => {
    expect(
      filterTemplates(templates, {}, { ...base, search: 'heatmap' }).map((t) => t.key),
    ).toEqual(['k2']);
    expect(
      filterTemplates(templates, {}, { ...base, search: 'data_cube' }).map((t) => t.key),
    ).toEqual(['k3']);
  });

  it('filters by review status, treating unreviewed as new', () => {
    const reviews: ReviewMap = { k1: { status: 'approved', feedback: '', reviewed_at: '' } };
    const onlyNew = filterTemplates(templates, reviews, {
      ...base,
      statuses: new Set(['new'] as const),
    });
    expect(onlyNew.map((t) => t.key)).toEqual(['k2', 'k3']);

    const onlyApproved = filterTemplates(templates, reviews, {
      ...base,
      statuses: new Set(['approved'] as const),
    });
    expect(onlyApproved.map((t) => t.key)).toEqual(['k1']);
  });
});
