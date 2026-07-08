import { afterEach, describe, expect, it } from 'vitest';
import { createConversationStore } from '@/features/chat/stores/conversationStore';
import { createDashboardStore } from '@/features/dashboard/stores/dashboardStore';
import {
  __resetSnapshotRegistryForTests,
  captureCurrentSession,
  registerSnapshotSource,
} from './snapshotRegistry';

afterEach(() => {
  __resetSnapshotRegistryForTests();
});

describe('snapshotRegistry', () => {
  it('returns null when no source has been registered', () => {
    expect(captureCurrentSession()).toBeNull();
  });

  it('captures messages + dashboard export after registration', () => {
    const conversation = createConversationStore();
    const dashboard = createDashboardStore();
    conversation.getState().addMessage({ role: 'user', content: 'hello' });
    registerSnapshotSource({ conversation, dashboard });

    const snapshot = captureCurrentSession();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.version).toBe(1);
    expect(snapshot?.conversation.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(snapshot?.layout).toEqual({ items: [] });
    expect(snapshot?.visualizations).toEqual([]);
  });

  it('returns the latest registered source on overwrite', () => {
    const c1 = createConversationStore();
    c1.getState().addMessage({ role: 'user', content: 'first' });
    registerSnapshotSource({ conversation: c1, dashboard: createDashboardStore() });

    const c2 = createConversationStore();
    c2.getState().addMessage({ role: 'user', content: 'second' });
    registerSnapshotSource({ conversation: c2, dashboard: createDashboardStore() });

    expect(captureCurrentSession()?.conversation.messages[0].content).toBe('second');
  });

  it('returns null when the dashboard exporter throws', () => {
    const conversation = createConversationStore();
    const dashboard = createDashboardStore();
    // Replace exportDashboard with a thrower — simulates the case where the
    // dashboard store itself is the source of the crash.
    const broken = {
      ...dashboard,
      getState: () => ({
        ...dashboard.getState(),
        exportDashboard: () => {
          throw new Error('boom');
        },
      }),
    } as typeof dashboard;
    registerSnapshotSource({ conversation, dashboard: broken });
    expect(captureCurrentSession()).toBeNull();
  });
});
