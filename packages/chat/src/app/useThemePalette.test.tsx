import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import type { UDIPalette } from 'udi-toolkit/react';
import { useThemePalette } from './useThemePalette';

/** Renders the hook against a root carrying `tokens`, exposing what it returns. */
function harness(tokens: Record<string, string>, override?: UDIPalette) {
  let latest: UDIPalette | undefined;

  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    latest = useThemePalette(ref, override);
    // Layout effects run before passive ones, so the tokens are in place before
    // the hook reads them — and only once, so the test can change them after.
    useLayoutEffect(() => {
      for (const [k, v] of Object.entries(tokens)) ref.current?.style.setProperty(k, v);
    }, []);
    return <div ref={ref} />;
  }

  const view = render(<Probe />);
  return {
    view,
    get palette() {
      return latest;
    },
  };
}

describe('useThemePalette', () => {
  it('maps the design tokens in effect onto the palette chrome channels', () => {
    const { palette } = harness({
      '--foreground': 'rgb(1, 2, 3)',
      '--muted-foreground': 'rgb(4, 5, 6)',
      '--border': 'rgb(7, 8, 9)',
    });

    expect(palette).toMatchObject({
      text: 'rgb(1, 2, 3)',
      mutedText: 'rgb(4, 5, 6)',
      axis: 'rgb(4, 5, 6)',
      grid: 'rgb(7, 8, 9)',
      // A plot must inherit the card it sits on, not paint its own white box —
      // the whole point of the fix.
      background: 'transparent',
    });
  });

  it('lets a consumer palette win per channel without losing the themed chrome', () => {
    const { palette } = harness(
      { '--foreground': 'rgb(1, 2, 3)', '--border': 'rgb(7, 8, 9)' },
      { mark: '#abc', text: '#fff' },
    );

    expect(palette?.mark).toBe('#abc');
    expect(palette?.text).toBe('#fff');
    expect(palette?.grid).toBe('rgb(7, 8, 9)');
  });

  it('re-reads when a host toggles dark mode on an ancestor', async () => {
    // Not destructured: `palette` is a getter that must be read after each act().
    const probe = harness({ '--foreground': 'rgb(1, 2, 3)' });
    expect(probe.palette?.text).toBe('rgb(1, 2, 3)');

    // Restyle the root the way `.dark .udi-yac` would, then trip the observer.
    const root = probe.view.container.firstElementChild as HTMLElement;
    root.style.setProperty('--foreground', 'rgb(250, 250, 250)');
    await act(async () => {
      document.documentElement.classList.add('dark');
      // MutationObserver batches its records, so let the queue drain.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(probe.palette?.text).toBe('rgb(250, 250, 250)');
    document.documentElement.classList.remove('dark');
  });
});
