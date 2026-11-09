import { describe, it, expect } from 'vitest';
import { agentDashboardState } from './agentDashboardState';
import type { ActiveVisualization } from '../stores/dashboardStore';

const viz = {} as ActiveVisualization;

describe('agentDashboardState', () => {
  it('lists open charts in reading order with their view flags, then the memory bank', () => {
    const state = agentDashboardState(
      {
        // Stored out of order: the grid's order is by position, not by array index.
        layout: {
          items: [
            { i: '5-0', x: 0, y: 4, w: 1, h: 4 },
            { i: '3-0', x: 1, y: 0, w: 1, h: 4 },
            { i: '1-0', x: 0, y: 0, w: 1, h: 4 },
            // A layout item whose chart is gone is not on the dashboard.
            { i: '9-0', x: 1, y: 4, w: 1, h: 4 },
          ],
        },
        activeVisualizations: new Map([
          ['1-0', viz],
          ['3-0', viz],
          ['5-0', viz],
        ]),
        tableViewKeys: new Set(['3-0']),
        sortedByTotalKeys: new Set(['5-0']),
      },
      { closedVisualizations: new Map([['7-1', viz]]) },
    );

    expect(state).toEqual({
      open: [{ key: '1-0' }, { key: '3-0', tableView: true }, { key: '5-0', sortByTotal: true }],
      closed: ['7-1'],
    });
  });
});
