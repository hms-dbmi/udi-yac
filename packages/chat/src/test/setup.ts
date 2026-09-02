import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest runs with `globals: false`, so Testing Library cannot self-register its
// auto-cleanup hook — without this, each rendered tree stays in the document and
// later queries match elements from earlier tests. No-op for non-DOM tests.
afterEach(cleanup);

// jsdom gaps that Base UI primitives hit on mount (ScrollArea measures itself
// and inspects running animations; Collapsible/Accordion observe resizes).
// Stubs, not polyfills — nothing under test depends on their behaviour.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

Element.prototype.getAnimations ??= () => [];

// Base UI's Checkbox dispatches a synthetic PointerEvent on click; jsdom
// doesn't implement the constructor, so a click would throw instead of
// toggling. MouseEvent carries everything the handlers read.
globalThis.PointerEvent ??= class extends MouseEvent {} as unknown as typeof PointerEvent;
