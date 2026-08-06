/**
 * Shape of `public/template_previews.json`, produced by
 * `packages/agent/scripts/export_template_previews.py`.
 *
 * Keep in sync with that script's `payload` construction — it is the only writer.
 */
import type { UDIGrammar } from 'udi-toolkit/react';

/**
 * `archived` is distinct from `rejected`: a rejected template is wrong, an
 * archived one is correct but no longer wanted as agent output — a candidate for
 * removal from the builder rather than a bug to fix.
 */
export const REVIEW_STATUSES = [
  'new',
  'approved',
  'rejected',
  'needs_changes',
  'archived',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  new: 'New',
  approved: 'Approved',
  rejected: 'Rejected',
  needs_changes: 'Needs changes',
  archived: 'Archived',
};

/** A template resolved successfully and can be rendered. */
export interface PreviewOk {
  status: 'ok';
  /** Abstract placeholder key -> concrete entity/field the exporter chose. */
  bindings: Record<string, string>;
  spec: UDIGrammar;
  /** Non-empty when the resolved spec doesn't conform to the grammar schema. */
  grammarError?: string;
}

/** The template's tags don't match what this data package selects. */
export interface PreviewShapeMismatch {
  status: 'shape_mismatch';
  reason: string;
}

/** Right shape, but no valid field binding exists in this data package. */
export interface PreviewUnsupported {
  status: 'unsupported';
  reason: string;
}

export type Preview = PreviewOk | PreviewShapeMismatch | PreviewUnsupported;

export interface TemplateRecord {
  /** Stable identity: first 12 hex of sha256(spec_template). Keys review state. */
  key: string;
  /** Position in template_visualizations.json. Display only — not stable. */
  index: number;
  /** Generated tool name. Display only: it embeds `index` and so can change. */
  toolName: string | null;
  toolDescription: string;
  bindingKeys: string[];
  chartType: string | null;
  chartComplexity: string | null;
  tags: string[];
  description: string;
  designConsiderations: string;
  tasks: string;
  taskTypes: string[];
  queryTemplates: string[];
  /** Static authoring hint set in the Python builder, distinct from review state. */
  reviewHint: string;
  specTemplate: string;
  /** Non-empty when the unresolved template itself fails grammar validation. */
  templateGrammarError: string;
  previews: Record<string, Preview>;
}

export interface DataPackageEntity {
  rowCount: number;
  fieldCount: number;
  isCube: boolean;
  dimensions: string[];
  measures: string[];
}

export interface DataPackageInfo {
  id: string;
  name: string;
  title: string;
  datapackageUrl: string;
  /** Template tags this package selects: ['data_cube'] or ['line_item']. */
  activeTags: string[];
  isCube: boolean;
  entities: Record<string, DataPackageEntity>;
}

export interface PreviewsPayload {
  templatesHash: string;
  grammarSchema: string;
  templateCount: number;
  dataPackages: DataPackageInfo[];
  templates: TemplateRecord[];
}

export interface ReviewEntry {
  status: ReviewStatus;
  feedback: string;
  reviewed_at: string;
  tool_name?: string;
  chart_type?: string;
}

export type ReviewMap = Record<string, ReviewEntry>;
