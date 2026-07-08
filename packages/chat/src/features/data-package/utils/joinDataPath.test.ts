import { describe, it, expect } from 'vitest';
import { joinDataPath } from './joinDataPath';

describe('joinDataPath', () => {
  it('joins base and resource with no extra slashes', () => {
    expect(joinDataPath('https://host.example/data', 'donors.csv')).toBe(
      'https://host.example/data/donors.csv',
    );
  });

  it('handles trailing slash on base', () => {
    expect(joinDataPath('https://host.example/data/', 'donors.csv')).toBe(
      'https://host.example/data/donors.csv',
    );
  });

  it('handles leading slash on resource', () => {
    expect(joinDataPath('https://host.example/data', '/donors.csv')).toBe(
      'https://host.example/data/donors.csv',
    );
  });

  it('handles trailing-slash base + leading-slash resource', () => {
    expect(joinDataPath('https://host.example/data/', '/donors.csv')).toBe(
      'https://host.example/data/donors.csv',
    );
  });

  it('works for relative local paths', () => {
    expect(joinDataPath('./data', 'donors.csv')).toBe('./data/donors.csv');
    expect(joinDataPath('./data/', '/donors.csv')).toBe('./data/donors.csv');
  });

  it('preserves nested resource paths', () => {
    expect(joinDataPath('https://host.example', 'sub/dir/donors.csv')).toBe(
      'https://host.example/sub/dir/donors.csv',
    );
  });
});
