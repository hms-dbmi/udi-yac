import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useApiConfig,
  useDashboardStore,
  useDataFiltersStore,
  useDataPackage,
  useDataPackageStore,
  useTracker,
} from '@/app/UDIChatContext';
import { instantiateVisTemplate, VisRebindError } from '../api/visTemplate';
import type { TemplateProvenance } from '../stores/dashboardStore';

export interface TemplateRebind {
  /** Change one template binding and replace the chart with the result. */
  rebind: (param: string, newField: string) => Promise<void>;
  /** Parameter currently in flight, if any. */
  pendingParam: string | null;
  /** Why the last attempt was refused, if it was. */
  error: string | null;
}

/**
 * The network + store choreography behind re-binding a generated chart.
 *
 * Separate from the control that triggers it because the interesting behaviour is
 * all here: a re-bind can be slow, can be refused, and can be superseded while in
 * flight, and in every one of those cases the chart the user is looking at must be
 * left no worse than before they touched it. The store is only ever written on a
 * response that is both successful and still current.
 */
export function useTemplateRebind(
  vizKey: string,
  template: TemplateProvenance | undefined,
): TemplateRebind {
  const apiConfig = useApiConfig();
  const dashboardStore = useDashboardStore();
  const dataFiltersStore = useDataFiltersStore();
  const dataPackageStore = useDataPackageStore();
  const sourceFields = useDataPackage((s) => s.sourceFields);
  const trackEvent = useTracker();

  const [pendingParam, setPendingParam] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may write: flicking through a dropdown fires several
  // and they can resolve out of order, which would otherwise apply an older spec.
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const rebind = useCallback(
    async (param: string, newField: string) => {
      if (!template) return;
      const seq = ++requestSeq.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPendingParam(param);
      setError(null);
      try {
        const result = await instantiateVisTemplate(
          apiConfig,
          {
            tool: template.tool,
            // Everything the agent gave us with this one parameter changed, so
            // successive tweaks compose instead of resetting each other.
            toolArgs: { ...template.toolArgs, [param]: newField },
            dataSchema: dataPackageStore.getState().dataPackageString,
          },
          controller.signal,
        );
        if (seq !== requestSeq.current) return;
        dashboardStore
          .getState()
          .applyTemplateRebind(vizKey, result.spec, result.toolArgs, result.params, sourceFields);
        // Re-apply named + null filters to the new pipeline, as a spec rewrite does.
        dashboardStore.getState().updateSpecFilters(dataFiltersStore, dataPackageStore);
        trackEvent('visualization_tweaked', { encoding: param, kind: 'binding' });
      } catch (err) {
        if (controller.signal.aborted || seq !== requestSeq.current) return;
        if (err instanceof VisRebindError && err.code === 'unknown_template') {
          // The agent's templates have moved on from this chart: withdraw the
          // control rather than leave one that can only keep failing.
          dashboardStore.getState().clearTemplateProvenance(vizKey);
        }
        // The store is untouched, so the chart survives and the control falls
        // back to the stored binding on the next render.
        setError(err instanceof Error ? err.message : String(err));
        trackEvent('visualization_tweak_failed', { encoding: param, kind: 'binding' });
      } finally {
        if (seq === requestSeq.current) setPendingParam(null);
      }
    },
    [
      apiConfig,
      dashboardStore,
      dataFiltersStore,
      dataPackageStore,
      sourceFields,
      template,
      trackEvent,
      vizKey,
    ],
  );

  return { rebind, pendingParam, error };
}
