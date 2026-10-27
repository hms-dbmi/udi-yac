import { useMemo } from 'react';
import { useDataFilters, useDataPackage } from '@/app/UDIChatContext';
import type { DataSelections } from '../stores/dataFiltersStore';
import { withLinkedSelections } from '../utils/linkedSelections';

/**
 * The selections to hand the toolkit: every filter, plus the selections links
 * mirror them onto (see `linkedSelections`). The named filters in a spec can
 * reference a mirror, and they resolve against whatever was bound.
 */
export function useToolkitSelections(): DataSelections {
  const dataSelections = useDataFilters((s) => s.dataSelections);
  const filterScopes = useDataFilters((s) => s.filterScopes);
  const dimensionLinks = useDataPackage((s) => s.dimensionLinks);
  return useMemo(
    () => withLinkedSelections(dataSelections, dimensionLinks, filterScopes),
    [dataSelections, dimensionLinks, filterScopes],
  );
}
