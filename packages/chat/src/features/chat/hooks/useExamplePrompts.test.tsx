/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { UDIChatProvider, useDataPackageStore } from '@/app/UDIChatContext';
import type { DataPackage } from '@/types/dataPackage';
import { useExamplePrompts } from './useExamplePrompts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useExamplePrompts', () => {
  it('waits for the data package, then asks for its own prompts', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(['Survival by cohort?']))),
    );
    vi.stubGlobal('fetch', fetchMock);
    let dataPackageStore: ReturnType<typeof useDataPackageStore> | null = null;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <UDIChatProvider>{children}</UDIChatProvider>
    );

    const { result } = renderHook(
      () => {
        dataPackageStore = useDataPackageStore();
        return useExamplePrompts('http://agent');
      },
      { wrapper },
    );
    // No package yet: fetching now would get the global list, then swap it.
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      dataPackageStore!.setState({
        dataPackage: { name: 'pcx', 'udi:path': '', resources: [] } satisfies DataPackage,
      });
    });

    await waitFor(() => expect(result.current.examplePrompts).toEqual(['Survival by cohort?']));
    expect(fetchMock).toHaveBeenCalledWith('http://agent/v1/yac/examples?package=pcx');
  });
});
