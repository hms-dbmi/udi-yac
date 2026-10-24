/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { UDIChatProvider, useDashboardStore } from '@/app/UDIChatContext';
import { useLayoutPersistence } from './useLayoutPersistence';

const KEY = 'udi-yac:dashboard:v3';
const wrapper = ({ children }: { children: ReactNode }) => (
  <UDIChatProvider>{children}</UDIChatProvider>
);

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('useLayoutPersistence', () => {
  it('restores the row height an older version saved with its whole layout', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 3, layout: { items: [] }, vizKeys: [], gridRowHeight: 90 }),
    );
    const { result } = renderHook(
      () => {
        useLayoutPersistence();
        return useDashboardStore();
      },
      { wrapper },
    );
    expect(result.current.getState().gridRowHeight).toBe(90);
  });

  it('saves a changed row height', () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      () => {
        useLayoutPersistence({ restore: false });
        return useDashboardStore();
      },
      { wrapper },
    );
    const before = result.current.getState().gridRowHeight;
    act(() => result.current.getState().setGridRowHeight(before + 20));
    act(() => vi.runAllTimers());
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ gridRowHeight: before + 20 });
  });
});
