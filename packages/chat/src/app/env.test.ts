import { describe, it, expect, vi, afterEach } from 'vitest';
import { str, bool } from '@/app/env';
import { ENV_VARS } from '@/app/envVars';

afterEach(() => vi.restoreAllMocks());

describe('str', () => {
  it('falls back when the value is missing', () => {
    expect(str(undefined, 'fallback')).toBe('fallback');
  });

  // The regression this exists for: CI interpolates "" for an unset repo
  // variable, and `?? fallback` kept the empty string — leaving
  // dataPackagePath === '' which falls through every data-source branch in
  // UDIChat and renders a blank app with no error.
  it.each(['', '   ', '\t\n'])('treats blank %o as unset', (raw) => {
    expect(str(raw, 'fallback')).toBe('fallback');
  });

  it('trims a real value', () => {
    expect(str('  http://localhost:8007  ', 'fallback')).toBe('http://localhost:8007');
  });

  it('returns undefined with no fallback', () => {
    expect(str(undefined)).toBeUndefined();
    expect(str('')).toBeUndefined();
  });
});

describe('bool', () => {
  it.each(['1', 'true', 'TRUE', ' Yes ', 'on'])('reads %o as true', (raw) => {
    expect(bool(raw, false)).toBe(true);
  });

  // Previously only the exact lowercase 'false' disabled the prompt, so
  // 'False', '0' and 'no' all silently meant true.
  it.each(['0', 'false', 'False', 'NO', 'off'])('reads %o as false', (raw) => {
    expect(bool(raw, true)).toBe(false);
  });

  it.each([undefined, '', '  '])('falls back when %o', (raw) => {
    expect(bool(raw, true)).toBe(true);
    expect(bool(raw, false)).toBe(false);
  });

  it('warns and falls back on an unrecognized value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(bool('maybe', true)).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('ENV_VARS', () => {
  it('describes every variable exactly once', () => {
    const names = ENV_VARS.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every variable a non-empty description', () => {
    for (const { name, description } of ENV_VARS) {
      expect(description, name).toBeTruthy();
    }
  });
});
