// node --test src/lib/catalog.test.ts   (Node strips the types; no test framework)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchFor, selectFromSearch, type CatalogPackage } from './catalog.ts';

const packages: CatalogPackage[] = [
  {
    id: 'pcx',
    title: 'pcx',
    description: '',
    datapackage: 'pcx/datapackage.json',
    sessions: [{ id: 'demo', title: 'Demo', description: '', path: 'pcx/sessions/demo.json' }],
  },
  {
    id: 'remote',
    title: 'remote',
    description: '',
    datapackage: 'https://example.org/pkg/datapackage.json',
    sessions: [],
  },
];
const dataDir = new URL('https://host/udi-yac/app/data/');
const quiet = () => {};

test('picks the package and session the query names', () => {
  const s = selectFromSearch(packages, '?package=pcx&session=demo', dataDir, quiet);
  assert.equal(s.pkg.id, 'pcx');
  assert.equal(s.sessionId, 'demo');
  assert.equal(s.dataPackageUrl, 'https://host/udi-yac/app/data/pcx/datapackage.json');
  assert.equal(s.sessionUrl, 'https://host/udi-yac/app/data/pcx/sessions/demo.json');
});

test('opens the first package when none or an unknown one is named', () => {
  const warnings: string[] = [];
  assert.equal(selectFromSearch(packages, '', dataDir, quiet).pkg.id, 'pcx');
  assert.equal(
    selectFromSearch(packages, '?package=nope', dataDir, (m) => warnings.push(m)).pkg.id,
    'pcx',
  );
  assert.equal(warnings.length, 1);
});

test('an unknown session opens the package empty', () => {
  const s = selectFromSearch(packages, '?package=pcx&session=nope', dataDir, quiet);
  assert.equal(s.sessionId, undefined);
  assert.equal(s.sessionUrl, undefined);
});

test('absolute package URLs pass through', () => {
  const s = selectFromSearch(packages, '?package=remote', dataDir, quiet);
  assert.equal(s.dataPackageUrl, 'https://example.org/pkg/datapackage.json');
});

test('searchFor round-trips through selectFromSearch', () => {
  const s = selectFromSearch(packages, searchFor('pcx', 'demo'), dataDir, quiet);
  assert.equal(s.sessionId, 'demo');
  assert.equal(searchFor('remote'), '?package=remote');
});
