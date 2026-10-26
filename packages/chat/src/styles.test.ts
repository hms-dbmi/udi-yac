import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Relative to the package root, which is vitest's cwd.
const css = readFileSync('src/index.css', 'utf8');

describe('index.css cascade', () => {
  it('applies the border color after the vendored preflight resets it', () => {
    // `border: 0 solid` is a shorthand: it resets border-color to the initial
    // `currentColor`. Both rules match `.udi-yac, .udi-yac *` at the same
    // specificity, so source order decides. Written first, every border that
    // does not name its own color renders in the foreground — the chat panel's
    // `udi:border-r` came out black.
    const reset = css.lastIndexOf('border: 0 solid');
    const borderColor = css.indexOf('@apply udi:border-border');
    expect(reset).toBeGreaterThan(-1);
    expect(borderColor).toBeGreaterThan(reset);
  });
});
