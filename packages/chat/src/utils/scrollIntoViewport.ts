/**
 * Scroll an element into view inside its own ScrollArea viewport.
 *
 * `Element.scrollIntoView` walks every scrollable ancestor, which drags the
 * host page along when the chat is embedded in another site (see the same
 * note in useMessageListScroll). This finds the enclosing Base UI viewport
 * (`data-slot="scroll-area-viewport"`) and scrolls only that, mirroring
 * `block: 'nearest'`: an element already fully visible doesn't move, one off
 * the top aligns to the top, one off the bottom aligns to the bottom — each
 * with `margin` px of breathing room.
 */
export function scrollIntoViewport(el: HTMLElement, margin = 8): void {
  const viewport = el.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
  if (!viewport) return;

  const viewportRect = viewport.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const above = elRect.top - viewportRect.top - margin;
  const below = elRect.bottom - viewportRect.bottom + margin;

  // Both positive/both negative can't happen unless the element is taller than
  // the viewport, in which case aligning its top is the useful choice.
  let delta = 0;
  if (above < 0) delta = above;
  else if (below > 0) delta = Math.min(below, above);
  if (delta === 0) return;

  viewport.scrollTo({ top: viewport.scrollTop + delta, behavior: 'smooth' });
}
