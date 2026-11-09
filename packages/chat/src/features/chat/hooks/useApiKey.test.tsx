/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useApiKey } from './useApiKey';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('useApiKey', () => {
  it('ignores a stored key and never asks for one when keys are disallowed', () => {
    localStorage.setItem('udi-chat-api-key', 'sk-stored');
    const { result, rerender } = renderHook(
      ({ allowApiKey }) => useApiKey({ requireApiKey: true, allowApiKey }),
      { initialProps: { allowApiKey: false } },
    );
    expect(result.current.openAiKey).toBeNull();
    expect(result.current.needsApiKey).toBe(false);

    rerender({ allowApiKey: true });
    expect(result.current.openAiKey).toBe('sk-stored');
  });
});
