import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryStore, createStore, type SessionRecord } from './store.js';

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
