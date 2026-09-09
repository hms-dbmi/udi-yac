export interface ScrollIntoViewportOptions {
  /** Where to land an element that isn't fully visible. `'nearest'` moves it
   *  the shorter way (off the top → align top, off the bottom → align bottom);
   *  `'start'` always brings its top to the top of the viewport, which is what
   *  you want for a tall target whose header carries its identity. */
  block?: 'nearest' | 'start';
  /** Breathing room, in px, between the element and the viewport edge. */
  margin?: number;
}

/**
 * Scroll an element into view inside its own ScrollArea viewport.
 *
 * `Element.scrollIntoView` walks every scrollable ancestor, which drags the
 * host page along when the chat is embedded in another site (see the same
 * note in useMessageListScroll). This finds the enclosing Base UI viewport
 * (`data-slot="scroll-area-viewport"`) and scrolls only that. An element
 * already fully visible never moves, whichever `block` is asked for.
 *
 * A band that stays pinned to the top of the viewport (the dashboard's header
 * + filters) overlays the scrolling content, so "the top of the viewport" is
 * really the bottom of that band. Tag such a band with `data-scroll-sticky-top`
 * and its height is held clear here.
 */
export function scrollIntoViewport(
  el: HTMLElement,
  { block = 'nearest', margin = 8 }: ScrollIntoViewportOptions = {},
): void {
  const viewport = el.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
  if (!viewport) return;

  const viewportRect = viewport.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const sticky = viewport.querySelector<HTMLElement>('[data-scroll-sticky-top]');
  const top = viewportRect.top + (sticky?.getBoundingClientRect().height ?? 0);

  // Signed distances the element's edges sit outside the visible band:
  // `above < 0` means its top is cut off (or hidden under the sticky band),
  // `below > 0` its bottom below the viewport.
  const above = elRect.top - top - margin;
  const below = elRect.bottom - viewportRect.bottom + margin;

  // Fully visible: nothing to do.
  if (above >= 0 && below <= 0) return;

  // `above` is exactly the shift that puts the element's top at the top of the
  // visible band, so 'start' — and any element too tall to fit, where aligning
  // the bottom would hide the top — uses it directly.
  const delta = block === 'start' || above < 0 ? above : Math.min(below, above);
  if (delta === 0) return;

  viewport.scrollTo({ top: viewport.scrollTop + delta, behavior: 'smooth' });
}
