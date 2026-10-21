/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSessionExport } from './dashboardSerialization';
import { deleteSavedSession, listSavedSessions, saveSession } from './savedSessions';

const session = buildSessionExport({
  messages: [],
  dashboard: { visualizations: [], layout: { items: [] } },
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('saved sessions', () => {
  it('saves newest first, per key, and deletes by id', () => {
    saveSession('pcx', 'first', session);
    const [second] = saveSession('pcx', 'second', session);
    saveSession('penguins', 'other package', session);

    expect(listSavedSessions('pcx').map((s) => s.name)).toEqual(['second', 'first']);
    expect(listSavedSessions('pcx')[0].session).toEqual(session);
    expect(listSavedSessions('penguins').map((s) => s.name)).toEqual(['other package']);

    deleteSavedSession('pcx', second.id);
    expect(listSavedSessions('pcx').map((s) => s.name)).toEqual(['first']);
  });

  it('reads unparseable storage as empty', () => {
    localStorage.setItem('udi-yac:saved-sessions:pcx', '{not json');
    expect(listSavedSessions('pcx')).toEqual([]);
  });

  it('throws when the save cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => saveSession('pcx', 'lost', session)).toThrow('full');
  });
});
