/**
 * Viewport tracking for lazily mounting the expensive part of a card.
 *
 * Each visualization mounts a Vue custom element that compiles a Vega spec and
 * embeds a view (or builds an ag-grid). With 60+ templates on screen that is far
 * too much work to do up front, so cards only mount their chart while they are
 * near the viewport and tear it down once they are well clear of it.
 *
 * One IntersectionObserver is shared per `rootMargin` rather than one per card —
 * the browser batches all entries for a shared observer into a single callback,
 * which is meaningfully cheaper than 60 separate observers during a fast scroll.
 */
import { useEffect, useState, type RefObject } from 'react';

type Callback = (isIntersecting: boolean) => void;

interface SharedObserver {
  observer: IntersectionObserver;
  callbacks: Map<Element, Callback>;
}

const observers = new Map<string, SharedObserver>();

function getSharedObserver(rootMargin: string): SharedObserver {
  const existing = observers.get(rootMargin);
  if (existing) return existing;

  const callbacks = new Map<Element, Callback>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        callbacks.get(entry.target)?.(entry.isIntersecting);
      }
    },
    { rootMargin },
  );

  const shared: SharedObserver = { observer, callbacks };
  observers.set(rootMargin, shared);
  return shared;
}

export interface UseInViewportOptions {
  /**
   * How far outside the viewport still counts as visible. A generous margin
   * mounts charts just before they scroll into view, so scrolling at a normal
   * speed shows a chart rather than a placeholder.
   */
  rootMargin?: string;
  /**
   * Once true, stay true — mount the chart on first approach and never tear it
   * down. Trades memory for never re-embedding. Off by default: with 60+
   * templates, keeping every visited chart alive is what makes the page crawl.
   */
  once?: boolean;
  /**
   * Delay before reporting *becoming* visible, in ms. Compiling and embedding a
   * Vega view blocks the main thread, so mounting mid-scroll is what makes
   * scrolling stutter. Waiting for the scroll to settle means cards flicked past
   * are never mounted at all. Becoming hidden is always reported immediately —
   * unmounting is cheap and frees the main thread sooner.
   */
  mountDelayMs?: number;
}

export function useInViewport(
  ref: RefObject<Element | null>,
  { rootMargin = '300px 0px', once = false, mountDelayMs = 180 }: UseInViewportOptions = {},
): boolean {
  // Without IntersectionObserver (older browser, or jsdom in tests) start
  // visible: degrade to rendering everything rather than rendering nothing.
  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const { observer, callbacks } = getSharedObserver(rootMargin);
    let mountTimer: ReturnType<typeof setTimeout> | undefined;

    callbacks.set(element, (intersecting) => {
      if (intersecting) {
        if (mountTimer !== undefined) return; // already scheduled
        mountTimer = setTimeout(() => {
          mountTimer = undefined;
          setIsVisible(true);
        }, mountDelayMs);
        return;
      }

      // Left the margin: drop any pending mount, then unmount immediately.
      if (mountTimer !== undefined) {
        clearTimeout(mountTimer);
        mountTimer = undefined;
      }
      if (!once) setIsVisible(false);
    });
    observer.observe(element);

    return () => {
      if (mountTimer !== undefined) clearTimeout(mountTimer);
      callbacks.delete(element);
      observer.unobserve(element);
      // Release the observer once nothing is using it, rather than keeping it
      // (and its entry in the module-level map) alive for the page's lifetime.
      if (callbacks.size === 0) {
        observer.disconnect();
        observers.delete(rootMargin);
      }
    };
  }, [ref, rootMargin, once, mountDelayMs]);

  return isVisible;
}
