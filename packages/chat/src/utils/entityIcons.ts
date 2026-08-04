import { Users, FlaskConical, Table2 } from 'lucide-react';
import type { EntityIconMap } from '@/features/dashboard';

/**
 * Built-in entity → icon map, merged under any consumer-supplied icons from
 * `useEntityIcons()`. Shared by the dashboard's count chips and the data
 * overview panel, so it lives outside both — the fast-refresh rule forbids
 * exporting it from a component module.
 */
export const DEFAULT_ENTITY_ICONS: EntityIconMap = {
  donors: Users,
  donor: Users,
  subject: Users,
  subjects: Users,
  samples: FlaskConical,
  sample: FlaskConical,
  biosample: FlaskConical,
  biosamples: FlaskConical,
  dataset: Table2,
  datasets: Table2,
};

/** Fallback for an entity with no icon of its own. */
export const FALLBACK_ENTITY_ICON = Table2;
