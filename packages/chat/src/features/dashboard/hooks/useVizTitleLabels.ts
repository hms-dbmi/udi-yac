import { useMemo } from 'react';
import { useDataPackage } from '@/app/UDIChatContext';
import type { VizTitleLabels } from '../utils/vizTitle';

/**
 * The data package's display labels, in the shape `buildVizTitle` wants.
 *
 * The three lookups are stable store actions that read through to current
 * state, so the object only needs rebuilding when the package itself changes —
 * which is also what makes a title recompute once labels arrive.
 */
export function useVizTitleLabels(): VizTitleLabels {
  const dataPackage = useDataPackage((s) => s.dataPackage);
  const getFieldLabel = useDataPackage((s) => s.getFieldLabel);
  const getEntityLabel = useDataPackage((s) => s.getEntityLabel);
  const getFieldDataType = useDataPackage((s) => s.getFieldDataType);
  return useMemo(
    () => ({ getFieldLabel, getEntityLabel, getFieldDataType }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataPackage, getFieldLabel, getEntityLabel, getFieldDataType],
  );
}
