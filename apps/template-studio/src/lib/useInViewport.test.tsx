// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
// `cleanup` is called explicitly: vitest runs with `globals: false`, so
// @testing-library/react's automatic afterEach cleanup never registers and
// rendered trees would otherwise accumulate across tests.
import { act, cleanup, render } from '@testing-library/react';
import { useInViewport } from './useInViewport';

/**
 * Minimal IntersectionObserver stand-in that lets a test drive intersection
 * changes directly. jsdom has no implementation of its own.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  targets = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  /** Report `isIntersecting` for every observed target. */
  emit(isIntersecting: boolean) {
    const entries = [...this.targets].map(
      (target) => ({ target, isIntersecting }) as IntersectionObserverEntry,
    );
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

function Probe({ mountDelayMs }: { mountDelayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInViewport(ref, { mountDelayMs, rootMargin: `test-${mountDelayMs ?? 'd'}` });
  return (
    <div ref={ref} data-testid="target">
      {visible ? 'visible' : 'hidden'}
    </div>
  );
}

const observers = () => FakeIntersectionObserver.instances;

beforeEach(() => {
  vi.useFakeTimers();
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useInViewport', () => {
  it('starts hidden so charts are not mounted up front', () => {
    const { getByTestId } = render(<Probe mountDelayMs={100} />);
    expect(getByTestId('target').textContent).toBe('hidden');
  });

  it('becomes visible only after the mount delay elapses', () => {
    const { getByTestId } = render(<Probe mountDelayMs={100} />);

    act(() => observers()[0].emit(true));
    // Still hidden: mounting is deferred so it never happens mid-scroll.
    expect(getByTestId('target').textContent).toBe('hidden');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(getByTestId('target').textContent).toBe('visible');
  });

  it('cancels a pending mount when the card scrolls past before the delay', () => {
    const { getByTestId } = render(<Probe mountDelayMs={200} />);

    act(() => observers()[0].emit(true));
    act(() => {
      vi.advanceTimersByTime(150); // not yet elapsed
    });
    act(() => observers()[0].emit(false)); // flicked past

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // The chart must never mount — this is what keeps a fast scroll cheap.
    expect(getByTestId('target').textContent).toBe('hidden');
  });

  it('unmounts immediately once out of view', () => {
    const { getByTestId } = render(<Probe mountDelayMs={50} />);

    act(() => observers()[0].emit(true));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(getByTestId('target').textContent).toBe('visible');

    act(() => observers()[0].emit(false));
    expect(getByTestId('target').textContent).toBe('hidden');
  });

  it('stays mounted after leaving the viewport when `once` is set', () => {
    function OnceProbe() {
      const ref = useRef<HTMLDivElement>(null);
      const visible = useInViewport(ref, { once: true, mountDelayMs: 10, rootMargin: 'once' });
      return (
        <div ref={ref} data-testid="target">
          {visible ? 'visible' : 'hidden'}
        </div>
      );
    }
    const { getByTestId } = render(<OnceProbe />);

    act(() => observers()[0].emit(true));
    act(() => {
      vi.advanceTimersByTime(10);
    });
    act(() => observers()[0].emit(false));
    expect(getByTestId('target').textContent).toBe('visible');
  });

  it('stops observing on unmount so scrolling does not touch dead cards', () => {
    const { unmount } = render(<Probe mountDelayMs={10} />);
    const observer = observers()[0];
    expect(observer.targets.size).toBe(1);
    unmount();
    expect(observer.targets.size).toBe(0);
  });

  it('renders everything when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { getByTestId } = render(<Probe mountDelayMs={10} />);
    expect(getByTestId('target').textContent).toBe('visible');
  });
});
