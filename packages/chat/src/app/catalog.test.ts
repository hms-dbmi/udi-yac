/**
 * `sample-data/catalog.json` lists the packages and predefined sessions the
 * standalone app offers. A session is a frozen export: regenerate its package
 * with a table renamed and the session still parses, then renders nothing. So
 * beyond parsing, every chart's source must still be a table of its package.
 */
import { describe, expect, it } from 'vitest';
import catalog from '../../../../sample-data/catalog.json';
import { parseSessionExport } from '@/features/dashboard/utils/dashboardSerialization';

const DATA_DIR = '../../../../sample-data/';
const files: Record<string, unknown> = import.meta.glob('../../../../sample-data/**/*.json', {
  eager: true,
  import: 'default',
});
const readJson = (path: string): unknown => files[DATA_DIR + path];

function sourceNames(spec: unknown): string[] {
  const source = (spec as { source?: unknown }).source;
  const sources = Array.isArray(source) ? source : [source];
  return sources.map((s) => (s as { name: string }).name);
}

describe.each(catalog.packages)('catalog package $id', (pkg) => {
  it('points at a data package that exists', () => {
    expect(readJson(pkg.datapackage)).toBeDefined();
  });

  const sessions: { id: string; path: string }[] = pkg.sessions;
  it.each(sessions)('session $id parses and only charts tables of the package', (session) => {
    const tables = new Set(
      (readJson(pkg.datapackage) as { resources: { name: string }[] }).resources.map((r) => r.name),
    );
    const parsed = parseSessionExport(readJson(session.path));
    expect(parsed.ok ? null : parsed.error).toBeNull();
    if (!parsed.ok) return;
    for (const viz of parsed.value.visualizations) {
      for (const name of sourceNames(viz.spec)) expect(tables).toContain(name);
    }
  });
});
