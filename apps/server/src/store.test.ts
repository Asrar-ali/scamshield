import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeAnalytics, createInMemoryStore, createStore, emptyAnalytics, MAX_EVENTS_PER_SESSION, type SessionRecord } from './store.js';

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'id-1',
    alias: 'Anonymous Scammer',
    startedAt: 1,
    endedAt: null,
    outcome: 'in_progress',
    maxRisk: 0,
    turns: 0,
    tactics: [],
    ...overrides,
  };
}

describe('createInMemoryStore', () => {
  it('excludes in-progress sessions from the leaderboard', async () => {
    const store = createInMemoryStore();
    store.saveSessionStart(record());
    expect(await store.getLeaderboard()).toEqual([]);
  });

  it('includes finished sessions sorted by turns descending', async () => {
    const store = createInMemoryStore();
    store.saveSessionEnd(record({ id: 'a', turns: 3, outcome: 'caught', endedAt: 10 }));
    store.saveSessionEnd(record({ id: 'b', turns: 7, outcome: 'gave_up', endedAt: 20 }));
    const leaderboard = await store.getLeaderboard();
    expect(leaderboard.map((e) => e.sessionId)).toEqual(['b', 'a']);
    expect(leaderboard[0]).toEqual({ sessionId: 'b', alias: 'Anonymous Scammer', turns: 7, maxRisk: 0, outcome: 'gave_up', ts: 20 });
  });

  it('respects the limit parameter', async () => {
    const store = createInMemoryStore();
    for (let i = 0; i < 15; i += 1) {
      store.saveSessionEnd(record({ id: `s${i}`, turns: i, outcome: 'caught', endedAt: i }));
    }
    const leaderboard = await store.getLeaderboard(5);
    expect(leaderboard).toHaveLength(5);
  });

  it('defaults the limit to 10', async () => {
    const store = createInMemoryStore();
    for (let i = 0; i < 15; i += 1) {
      store.saveSessionEnd(record({ id: `s${i}`, turns: i, outcome: 'caught', endedAt: i }));
    }
    const leaderboard = await store.getLeaderboard();
    expect(leaderboard).toHaveLength(10);
  });

  it('records events without throwing', () => {
    const store = createInMemoryStore();
    expect(() => store.saveEvent('id-1', { type: 'risk', score: 10, ts: 1 })).not.toThrow();
    expect(() => store.saveEvent(undefined, { type: 'risk', score: 10, ts: 1 })).not.toThrow();
  });

  it('returns null for settings before any save', async () => {
    const store = createInMemoryStore();
    expect(await store.getSettings?.()).toBeNull();
  });

  it('keeps saved settings in a field and returns them on getSettings', async () => {
    const store = createInMemoryStore();
    const settings = {
      protectedName: 'Rose',
      notifyOn: 'coach' as const,
      contacts: [],
      model: '',
      voices: { grandma: '', guardian: '' },
      sensitivity: 'balanced' as const,
      persona: { name: 'Rose', age: 78, city: 'Ottawa', grandkid: 'Tyler', quirks: 'gardening' },
    };
    store.saveSettings?.(settings);
    expect(await store.getSettings?.()).toEqual(settings);
  });

  describe('getSessionEvents', () => {
    it('returns [] for a session with no events', async () => {
      const store = createInMemoryStore();
      expect(await store.getSessionEvents?.('unknown')).toEqual([]);
    });

    it('returns events for a session in ts order, keyed independently per session', async () => {
      const store = createInMemoryStore();
      store.saveEvent('s1', { type: 'risk', score: 10, ts: 20 });
      store.saveEvent('s1', { type: 'risk', score: 20, ts: 10 });
      store.saveEvent('s2', { type: 'risk', score: 99, ts: 15 });

      const s1Events = await store.getSessionEvents?.('s1');
      expect(s1Events).toEqual([
        { type: 'risk', score: 20, ts: 10 },
        { type: 'risk', score: 10, ts: 20 },
      ]);
      const s2Events = await store.getSessionEvents?.('s2');
      expect(s2Events).toEqual([{ type: 'risk', score: 99, ts: 15 }]);
    });

    it('drops events without a sessionId instead of throwing', () => {
      const store = createInMemoryStore();
      expect(() => store.saveEvent(undefined, { type: 'risk', score: 1, ts: 1 })).not.toThrow();
    });

    it(`caps retained events at ${MAX_EVENTS_PER_SESSION} per session, keeping the most recent`, async () => {
      const store = createInMemoryStore();
      for (let i = 0; i < MAX_EVENTS_PER_SESSION + 10; i += 1) {
        store.saveEvent('s1', { type: 'risk', score: i, ts: i });
      }
      const events = await store.getSessionEvents?.('s1');
      expect(events).toHaveLength(MAX_EVENTS_PER_SESSION);
      expect(events?.[0]).toEqual({ type: 'risk', score: 10, ts: 10 });
      expect(events?.[events.length - 1]).toEqual({
        type: 'risk',
        score: MAX_EVENTS_PER_SESSION + 9,
        ts: MAX_EVENTS_PER_SESSION + 9,
      });
    });
  });

  describe('getAnalytics', () => {
    it('returns zeros gracefully on an empty store', async () => {
      const store = createInMemoryStore();
      expect(await store.getAnalytics?.()).toEqual(emptyAnalytics());
    });

    it('excludes in-progress sessions and aggregates finished ones', async () => {
      const store = createInMemoryStore();
      store.saveSessionEnd({
        id: 'a',
        alias: 'A',
        startedAt: 0,
        endedAt: 10,
        outcome: 'caught',
        maxRisk: 90,
        turns: 4,
        tactics: ['payment_redirection', 'urgency_pressure'],
        alertsSent: 1,
      });
      store.saveSessionEnd({
        id: 'b',
        alias: 'B',
        startedAt: 0,
        endedAt: 10,
        outcome: 'gave_up',
        maxRisk: 30,
        turns: 2,
        tactics: ['urgency_pressure'],
      });
      store.saveSessionStart({ id: 'c', alias: 'C', startedAt: 0, endedAt: null, outcome: 'in_progress', maxRisk: 50, turns: 1, tactics: [] });

      const analytics = await store.getAnalytics?.();
      expect(analytics).toEqual({
        totalCalls: 2,
        caught: 1,
        gaveUp: 1,
        catchRate: 0.5,
        avgTurnsToCatch: 4,
        avgMaxRisk: 60,
        tacticFrequency: [
          { tactic: 'urgency_pressure', label: 'Urgency Pressure', count: 2 },
          { tactic: 'payment_redirection', label: 'Payment Redirection', count: 1 },
        ],
        totalAlertsSent: 1,
      });
    });

    it('treats a missing alertsSent as 0', async () => {
      const store = createInMemoryStore();
      store.saveSessionEnd({ id: 'a', alias: 'A', startedAt: 0, endedAt: 10, outcome: 'caught', maxRisk: 50, turns: 1, tactics: [] });
      const analytics = await store.getAnalytics?.();
      expect(analytics?.totalAlertsSent).toBe(0);
    });
  });
});

describe('computeAnalytics', () => {
  it('returns zeros for an empty array', () => {
    expect(computeAnalytics([])).toEqual(emptyAnalytics());
  });

  it('returns zeros when every record is still in_progress', () => {
    const records: SessionRecord[] = [
      { id: 'a', alias: 'A', startedAt: 0, endedAt: null, outcome: 'in_progress', maxRisk: 10, turns: 1, tactics: [] },
    ];
    expect(computeAnalytics(records)).toEqual(emptyAnalytics());
  });

  it('sorts tacticFrequency by count descending', () => {
    const records: SessionRecord[] = [
      { id: 'a', alias: 'A', startedAt: 0, endedAt: 1, outcome: 'caught', maxRisk: 80, turns: 3, tactics: ['a', 'b'] },
      { id: 'b', alias: 'B', startedAt: 0, endedAt: 1, outcome: 'caught', maxRisk: 80, turns: 3, tactics: ['b'] },
    ];
    const { tacticFrequency } = computeAnalytics(records);
    expect(tacticFrequency[0]).toMatchObject({ tactic: 'b', count: 2 });
    expect(tacticFrequency[1]).toMatchObject({ tactic: 'a', count: 1 });
  });
});

describe('createStore', () => {
  afterEach(() => {
    delete process.env.MONGODB_URI;
    vi.restoreAllMocks();
  });

  it('returns an in-memory store when MONGODB_URI is unset', async () => {
    delete process.env.MONGODB_URI;
    const store = createStore();
    expect(await store.getLeaderboard()).toEqual([]);
  });
});
