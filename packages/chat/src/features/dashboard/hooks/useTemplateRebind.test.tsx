/**
 * @vitest-environment jsdom
 *
 * Re-binding a generated chart goes through the agent, so unlike a local spec
 * rewrite it can be slow, refused, or superseded mid-flight. In every one of
 * those cases the chart on screen must be left no worse than it was.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import {
  ApiConfigProvider,
  UDIChatProvider,
  useDashboard,
  useDashboardStore,
  useDataPackageStore,
} from '@/app/UDIChatContext';
import { useTemplateRebind } from './useTemplateRebind';
import type { StoreApi } from 'zustand/vanilla';
import type { DashboardState, TemplateProvenance } from '../stores/dashboardStore';
import type { UDIGrammar } from 'udi-toolkit/react';

const SPEC = {
  source: { name: 'Event', source: 'event.csv' },
  representation: {
    mark: 'line',
    mapping: [{ encoding: 'color', field: 'organization_name', type: 'nominal' }],
  },
} as unknown as UDIGrammar;

const REBOUND = {
  ...SPEC,
  representation: {
    mark: 'line',
    mapping: [{ encoding: 'color', field: 'cns_diagnosis_category', type: 'nominal' }],
  },
} as unknown as UDIGrammar;

const TEMPLATE: TemplateProvenance = {
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
    },
  ],
};

const accepted = (field: string) => ({
  spec: field === 'organization_name' ? SPEC : REBOUND,
  toolArgs: { entity: 'Event', field4: field },
  params: [{ ...TEMPLATE.params[0], value: field }],
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let store: StoreApi<DashboardState> | null = null;

/** Seeds one active, template-generated visualization and exposes its store. */
function Harness({ children }: { children: ReactNode }) {
  const dashboardStore = useDashboardStore();
  const dataPackageStore = useDataPackageStore();
  // Gate on a store value rather than local state: the hook under test reads the
  // seeded viz, and this keeps the seed out of the render path.
  const seeded = useDashboard((s) => s.activeVisualizations.size > 0);
  useEffect(() => {
    store = dashboardStore;
    dashboardStore.getState().addActiveVisualization(0, 0, SPEC, '', null, undefined, TEMPLATE);
    dataPackageStore.setState({ dataPackageString: '{"resources":[]}' });
  }, [dashboardStore, dataPackageStore]);
  return seeded ? <>{children}</> : null;
}

function renderRebind() {
  return renderHook(
    () =>
      useTemplateRebind(
        '0-0',
        store?.getState().activeVisualizations.get('0-0')?.template ?? TEMPLATE,
      ),
    {
      wrapper: ({ children }) => (
        <UDIChatProvider>
          <ApiConfigProvider apiBaseUrl="http://agent.test" authToken="tok">
            <Harness>{children}</Harness>
          </ApiConfigProvider>
        </UDIChatProvider>
      ),
    },
  );
}

const viz = () => store!.getState().activeVisualizations.get('0-0')!;

afterEach(() => {
  // This suite runs without vitest globals, so RTL's auto-cleanup is never
  // registered and trees would otherwise accumulate between tests.
  cleanup();
  vi.restoreAllMocks();
  store = null;
});

describe('useTemplateRebind', () => {
  it('sends the full binding set with one parameter changed', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(accepted('cns_diagnosis_category')));

    const { result } = renderRebind();
    await result.current.rebind('field4', 'cns_diagnosis_category');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('http://agent.test/v1/yac/vis_instantiate');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.tool).toBe('vis_053_line_survival');
    // The rest of the bindings ride along, so tweaks compose rather than reset.
    expect(body.toolArgs).toEqual({ entity: 'Event', field4: 'cns_diagnosis_category' });
    expect(body.dataSchema).toBe('{"resources":[]}');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('applies the agent’s spec and keeps the viz identity', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(accepted('cns_diagnosis_category')),
    );

    const { result } = renderRebind();
    const uuidBefore = viz().uuid;
    await result.current.rebind('field4', 'cns_diagnosis_category');

    await waitFor(() => {
      expect(viz().spec).toEqual(REBOUND);
      expect(viz().template!.toolArgs.field4).toBe('cns_diagnosis_category');
      // Same uuid: a live brush and every cross-filter keyed on it survive.
      expect(viz().uuid).toBe(uuidBefore);
    });
  });

  it('leaves the chart untouched and reports why when the agent refuses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          code: 'invalid_bindings',
          error: "Field 'research_id' has 69 unique values, which is too many.",
        },
        422,
      ),
    );

    const { result } = renderRebind();
    const before = viz();
    await result.current.rebind('field4', 'research_id');

    await waitFor(() => expect(result.current.error).toContain('too many'));
    expect(viz().spec).toBe(before.spec);
    expect(viz().template!.toolArgs.field4).toBe('organization_name');
    // Still re-bindable: a rejected value is the user's problem to correct.
    expect(viz().template).toBeDefined();
  });

  it('withdraws provenance when the agent no longer knows the template', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'unknown_template', error: 'Unknown template' }, 404),
    );

    const { result } = renderRebind();
    await result.current.rebind('field4', 'cns_diagnosis_category');

    // Nothing about this chart will ever re-bind, so stop offering it.
    await waitFor(() => expect(viz().template).toBeUndefined());
    expect(viz().spec).toEqual(SPEC);
  });

  it('reports a transport failure without disturbing the chart', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderRebind();
    await result.current.rebind('field4', 'cns_diagnosis_category');

    await waitFor(() => expect(result.current.error).toContain('Failed to fetch'));
    expect(viz().spec).toEqual(SPEC);
    expect(viz().template).toBeDefined();
  });

  it('applies only the newest change when responses resolve out of order', async () => {
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call += 1;
      // The first (superseded) request answers last.
      const [body, delay] =
        call === 1 ? [accepted('organization_name'), 25] : [accepted('cns_diagnosis_category'), 0];
      return new Promise((resolve) => setTimeout(() => resolve(jsonResponse(body)), delay));
    });

    const { result } = renderRebind();
    const first = result.current.rebind('field4', 'organization_name');
    const second = result.current.rebind('field4', 'cns_diagnosis_category');
    await Promise.all([first, second]);

    expect(viz().template!.toolArgs.field4).toBe('cns_diagnosis_category');
    expect(viz().spec).toEqual(REBOUND);
  });

  it('does nothing at all without provenance', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useTemplateRebind('0-0', undefined), {
      wrapper: ({ children }) => (
        <UDIChatProvider>
          <ApiConfigProvider apiBaseUrl="http://agent.test">
            <Harness>{children}</Harness>
          </ApiConfigProvider>
        </UDIChatProvider>
      ),
    });
    await result.current.rebind('field4', 'cns_diagnosis_category');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
