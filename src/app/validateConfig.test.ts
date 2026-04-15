import { describe, it, expect } from 'vitest';
import { validateConfig } from './validateConfig';
import type { UDIChatConfig } from '@/app/UDIChatConfig';
import type { DataPackage } from '@/types/dataPackage';

const goodDataPackage: DataPackage = {
  'udi:path': 'https://host.example/data/',
  resources: [
    {
      name: 'donors',
      path: 'donors.csv',
      schema: { fields: [{ name: 'id', 'udi:data_type': 'nominal' }] },
    },
  ],
} as unknown as DataPackage;

describe('validateConfig', () => {
  it('passes for a valid config with dataPackagePath', () => {
    expect(() =>
      validateConfig({
        apiBaseUrl: 'http://localhost:8007',
        dataPackagePath: '/data/datapackage_udi.json',
      }),
    ).not.toThrow();
  });

  it('passes for a valid config with inline dataPackage', () => {
    expect(() =>
      validateConfig({
        apiBaseUrl: 'http://localhost:8007',
        dataPackage: goodDataPackage,
      }),
    ).not.toThrow();
  });

  it('throws when apiBaseUrl is missing', () => {
    expect(() =>
      validateConfig({
        apiBaseUrl: '',
        dataPackagePath: '/data/x.json',
      } as UDIChatConfig),
    ).toThrow(/apiBaseUrl/);
  });

  it('throws when apiBaseUrl is malformed', () => {
    expect(() =>
      validateConfig({
        apiBaseUrl: 'http://[not-a-real-url',
        dataPackagePath: '/data/x.json',
      }),
    ).toThrow(/not a valid URL/);
  });

  it('throws when no data source is provided', () => {
    expect(() =>
      validateConfig({
        apiBaseUrl: 'http://localhost:8007',
      }),
    ).toThrow(/No data source provided/);
  });

  it('throws when dataPackage.resources is empty', () => {
    expect(() =>
      validateConfig({
        apiBaseUrl: 'http://localhost:8007',
        dataPackage: { 'udi:path': 'https://x/', resources: [] } as unknown as DataPackage,
      }),
    ).toThrow(/non-empty array/);
  });

  it('throws when a resource is missing name or path', () => {
    expect(() =>
      validateConfig({
        apiBaseUrl: 'http://localhost:8007',
        dataPackage: {
          'udi:path': 'https://x/',
          resources: [{ name: 'donors' }, { path: 'samples.csv' }],
        } as unknown as DataPackage,
      }),
    ).toThrow(/missing a `path`|missing a `name`/);
  });

  it('throws when udi:path is missing', () => {
    expect(() =>
      validateConfig({
        apiBaseUrl: 'http://localhost:8007',
        dataPackage: {
          resources: [{ name: 'a', path: 'a.csv' }],
        } as unknown as DataPackage,
      }),
    ).toThrow(/udi:path/);
  });

  it('throws when dataFieldDomains is not an array', () => {
    expect(() =>
      validateConfig({
        apiBaseUrl: 'http://localhost:8007',
        dataPackage: goodDataPackage,
        dataFieldDomains: 'not-an-array' as never,
      }),
    ).toThrow(/dataFieldDomains/);
  });

  it('aggregates multiple errors into a single message', () => {
    let caught: Error | null = null;
    try {
      validateConfig({ apiBaseUrl: '', dataPackagePath: undefined } as UDIChatConfig);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/apiBaseUrl/);
    expect(caught!.message).toMatch(/No data source provided/);
  });
});
