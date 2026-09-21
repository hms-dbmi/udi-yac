import { describe, it, expect, vi } from 'vitest';
import { scrollIntoViewport } from './scrollIntoViewport';

/** jsdom does no layout, so every rect here is stated outright. The viewport
 *  is 300px tall at y=0 and scrolled to `scrollTop`; the target's rect is in
 *  the same viewport coordinates the real browser would report. */
function setup(opts: {
  target: { top: number; bottom: number };
  scrollTop?: number;
  stickyHeight?: number;
}) {
  const viewport = document.createElement('div');
  viewport.dataset.slot = 'scroll-area-viewport';
  stubRect(viewport, { top: 0, bottom: 300 });
  viewport.scrollTop = opts.scrollTop ?? 0;
  const scrollTo = vi.fn();
  viewport.scrollTo = scrollTo;

  if (opts.stickyHeight != null) {
    const sticky = document.createElement('div');
    sticky.setAttribute('data-scroll-sticky-top', '');
    stubRect(sticky, { top: 0, bottom: opts.stickyHeight });
    viewport.appendChild(sticky);
  }

  const target = document.createElement('div');
  stubRect(target, opts.target);
  viewport.appendChild(target);

  return { target, scrollTo };
}

function stubRect(el: HTMLElement, { top, bottom }: { top: number; bottom: number }) {
  el.getBoundingClientRect = () =>
    ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0 }) as DOMRect;
}

describe('scrollIntoViewport', () => {
  it('leaves a fully visible element alone', () => {
    const { target, scrollTo } = setup({ target: { top: 50, bottom: 120 } });
    scrollIntoViewport(target);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("nearest: pulls an element below the fold up by just what's needed", () => {
    const { target, scrollTo } = setup({ target: { top: 280, bottom: 340 }, scrollTop: 100 });
    scrollIntoViewport(target);
    // 40px past the bottom + 8px margin.
    expect(scrollTo).toHaveBeenCalledWith({ top: 148, behavior: 'smooth' });
  });

  it('start: aligns the top of an element below the fold', () => {
    const { target, scrollTo } = setup({ target: { top: 280, bottom: 340 }, scrollTop: 100 });
    scrollIntoViewport(target, { block: 'start' });
    // 280 - 0 - 8 = 272 down, putting the element's top 8px below the top edge.
    expect(scrollTo).toHaveBeenCalledWith({ top: 372, behavior: 'smooth' });
  });

  it('holds a sticky top band clear, so the element lands below it not under it', () => {
    const { target, scrollTo } = setup({
      target: { top: 280, bottom: 340 },
      scrollTop: 100,
      stickyHeight: 90,
    });
    scrollIntoViewport(target, { block: 'start' });
    expect(scrollTo).toHaveBeenCalledWith({ top: 282, behavior: 'smooth' });
  });

  it('counts an element hidden under the sticky band as not visible', () => {
    const { target, scrollTo } = setup({
      target: { top: 20, bottom: 200 },
      scrollTop: 100,
      stickyHeight: 90,
    });
    scrollIntoViewport(target);
    // 20 - 90 - 8 = -78: scroll back up until its top clears the band.
    expect(scrollTo).toHaveBeenCalledWith({ top: 22, behavior: 'smooth' });
  });

  it('aligns the top of an element taller than the viewport, either way', () => {
    for (const block of ['nearest', 'start'] as const) {
      const { target, scrollTo } = setup({ target: { top: 100, bottom: 900 }, scrollTop: 0 });
      scrollIntoViewport(target, { block });
      expect(scrollTo).toHaveBeenCalledWith({ top: 92, behavior: 'smooth' });
    }
  });

  it('does nothing without an enclosing ScrollArea viewport', () => {
    const orphan = document.createElement('div');
    stubRect(orphan, { top: 0, bottom: 10 });
    expect(() => scrollIntoViewport(orphan)).not.toThrow();
  });
});
