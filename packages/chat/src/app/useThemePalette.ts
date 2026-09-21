import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { UDIPalette } from 'udi-toolkit/react';

/**
 * The palette channels we can derive from our own design tokens. Everything
 * else (mark, category, ordinal, ramp) stays with the toolkit's defaults —
 * those are data colors, and our shadcn `--chart-*` tokens are greys.
 */
const TOKEN_FOR: Record<string, string> = {
  // Axis domain lines and ticks: present but quiet, like a border.
  axis: '--muted-foreground',
  // Gridlines and the plot frame.
  grid: '--border',
  // Tick labels, axis and legend titles, table text.
  text: '--foreground',
  // Empty cells and truncation notices.
  mutedText: '--muted-foreground',
};

function readChrome(root: HTMLElement): UDIPalette {
  const styles = getComputedStyle(root);
  const chrome: Record<string, string> = {
    // Inherit whatever card the visualization sits on rather than painting a
    // surface of our own — this is what stopped plots being white rectangles.
    background: 'transparent',
  };
  for (const [channel, token] of Object.entries(TOKEN_FOR)) {
    const value = styles.getPropertyValue(token).trim();
    if (value) chrome[channel] = value;
  }
  return chrome as UDIPalette;
}

/** Palette chrome is a flat map of color strings, so key-by-key is enough. */
function sameChrome(a: UDIPalette, b: UDIPalette): boolean {
  const keys = Object.keys(b) as Array<keyof UDIPalette>;
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}

/**
 * Derives the chart/table chrome colors from the design tokens actually in
 * effect on the chat root, and merges a consumer-supplied palette over them.
 *
 * Without this, charts keep Vega's built-in light defaults — a white plot with
 * black axes — inside a host app in dark mode, because the toolkit has no way
 * to see our CSS. Reading the computed tokens rather than hard-coding a second
 * dark palette means a consumer who overrides `--foreground` or `--border` gets
 * charts that follow, for free.
 *
 * Re-reads when the `dark` class is toggled, on the root itself or on any
 * ancestor — `<html>` is where a host usually puts it.
 */
export function useThemePalette(
  rootRef: RefObject<HTMLElement | null>,
  override?: UDIPalette,
): UDIPalette | undefined {
  const [chrome, setChrome] = useState<UDIPalette>();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () =>
      setChrome((prev) => {
        const next = readChrome(root);
        // Same colors, same object. A fresh identity here arrives at <UDIVis>
        // as a changed `palette` prop, and VegaLite re-embeds on any palette
        // change — which writes classes, which wakes the observer below.
        return prev && sameChrome(prev, next) ? prev : next;
      });
    sync();

    // `class` is the only attribute that can change which tokens apply, and it
    // can change on any ancestor (`.dark .udi-yac`), so watch the document.
    const observer = new MutationObserver((records) => {
      // Only an ancestor's class can change which tokens reach `root`. The
      // charts render into the light DOM (the custom element declares
      // `shadowRoot: false`) and Vega sets `vega-embed` / `fit-x` classes on
      // every embed, so an unfiltered observer fires on its own output.
      if (records.some((record) => (record.target as Element).contains(root))) sync();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
    return () => observer.disconnect();
  }, [rootRef]);

  // A palette passed by the consumer wins channel by channel, so overriding
  // `mark` doesn't cost them the theme-aware axes.
  return useMemo(
    () => (chrome || override ? { ...chrome, ...override } : undefined),
    [chrome, override],
  );
}
