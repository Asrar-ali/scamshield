import { afterEach, describe, expect, it, vi } from 'vitest';

const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
const toArray = vi.fn().mockResolvedValue([
  { id: 's1', alias: 'Bob', startedAt: 1, endedAt: 2, outcome: 'caught', maxRisk: 90, turns: 4, tactics: [] },
]);
const limit = vi.fn().mockReturnValue({ toArray });
const sort = vi.fn().mockReturnValue({ limit });
const find = vi.fn().mockReturnValue({ sort });
const findOne = vi.fn().mockResolvedValue(null);
const aggregateToArray = vi.fn().mockResolvedValue([]);
const aggregate = vi.fn().mockReturnValue({ toArray: aggregateToArray });
const collection = vi.fn().mockReturnValue({ updateOne, insertOne, find, findOne, aggregate });
const db = vi.fn().mockReturnValue({ collection });
const connect = vi.fn().mockResolvedValue(undefined);

vi.mock('mongodb', () => ({
  MongoClient: vi.fn().mockImplementation(() => ({ connect, db })),
}));

const { createMongoStore } = await import('./store-mongo.js');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('createMongoStore', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lazily connects once and reuses the connection across calls', async () => {
    const store = createMongoStore('mongodb://test');
    store.saveSessionStart({
      id: 's1',
      alias: 'Bob',
      startedAt: 1,
      endedAt: null,
      outcome: 'in_progress',
      maxRisk: 0,
      turns: 0,
      tactics: [],
    });
    store.saveEvent('s1', { type: 'risk', score: 10, ts: 1 });
    await flush();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(insertOne).toHaveBeenCalledTimes(1);
  });

  it('saveSessionEnd upserts the session record', async () => {
    const store = createMongoStore('mongodb://test');
    store.saveSessionEnd({
      id: 's1',
      alias: 'Bob',
      startedAt: 1,
      endedAt: 5,
      outcome: 'caught',
      maxRisk: 90,
      turns: 4,
      tactics: ['payment_redirection'],
    });
    await flush();
    expect(updateOne).toHaveBeenCalledWith({ id: 's1' }, { $set: expect.objectContaining({ outcome: 'caught' }) }, { upsert: true });
  });

  it('getLeaderboard returns mapped entries', async () => {
    const store = createMongoStore('mongodb://test');
    const entries = await store.getLeaderboard(5);
    expect(entries).toEqual([{ sessionId: 's1', alias: 'Bob', turns: 4, maxRisk: 90, outcome: 'caught', ts: 2 }]);
    expect(limit).toHaveBeenCalledWith(5);
  });

  it('getLeaderboard returns an empty array and never throws when the query fails', async () => {
    const store = createMongoStore('mongodb://test');
    toArray.mockRejectedValueOnce(new Error('boom'));
    await expect(store.getLeaderboard()).resolves.toEqual([]);
  });

  it('saveEvent never throws even when the underlying insert fails', async () => {
    const store = createMongoStore('mongodb://test');
    insertOne.mockRejectedValueOnce(new Error('boom'));
    expect(() => store.saveEvent('s1', { type: 'risk', score: 1, ts: 1 })).not.toThrow();
    await flush();
  });

  it('saveSettings upserts the singleton settings document', async () => {
    const store = createMongoStore('mongodb://test');
    store.saveSettings?.({
      protectedName: 'Rose',
      notifyOn: 'takeover',
      contacts: [],
      model: '',
      voices: { grandma: '', guardian: '' },
      sensitivity: 'balanced',
      persona: { name: 'Rose', age: 78, city: 'Ottawa', grandkid: 'Tyler', quirks: 'gardening' },
    });
    await flush();
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'singleton' },
      { $set: expect.objectContaining({ protectedName: 'Rose', notifyOn: 'takeover' }) },
      { upsert: true },
    );
  });

  it('getSettings returns null when nothing has been saved', async () => {
    const store = createMongoStore('mongodb://test');
    findOne.mockResolvedValueOnce(null);
    expect(await store.getSettings?.()).toBeNull();
  });

  it('getSettings returns the stored document mapped to the Settings shape', async () => {
    const store = createMongoStore('mongodb://test');
    findOne.mockResolvedValueOnce({
      _id: 'singleton',
      protectedName: 'Rose',
      notifyOn: 'coach',
      contacts: [{ id: 'c1', name: 'Sarah', channel: 'telegram', address: '123' }],
    });
    expect(await store.getSettings?.()).toEqual({
      protectedName: 'Rose',
      notifyOn: 'coach',
      contacts: [{ id: 'c1', name: 'Sarah', channel: 'telegram', address: '123' }],
    });
  });

  it('getSettings returns null and never throws when the query fails', async () => {
    const store = createMongoStore('mongodb://test');
    findOne.mockRejectedValueOnce(new Error('boom'));
    await expect(store.getSettings?.()).resolves.toBeNull();
  });

  it('saveSettings never throws even when the underlying upsert fails', async () => {
    const store = createMongoStore('mongodb://test');
    updateOne.mockRejectedValueOnce(new Error('boom'));
    expect(() =>
      store.saveSettings?.({
        protectedName: 'Rose',
        notifyOn: 'takeover',
        contacts: [],
        model: '',
        voices: { grandma: '', guardian: '' },
        sensitivity: 'balanced',
        persona: { name: 'Rose', age: 78, city: 'Ottawa', grandkid: 'Tyler', quirks: 'gardening' },
      }),
    ).not.toThrow();
    await flush();
  });

  it('getSettings maps model/voices/sensitivity/persona through from the stored document', async () => {
    const store = createMongoStore('mongodb://test');
    findOne.mockResolvedValueOnce({
      _id: 'singleton',
      protectedName: 'Rose',
      notifyOn: 'coach',
      contacts: [],
      model: 'gemini-3-pro-preview',
      voices: { grandma: 'v1', guardian: 'v2' },
      sensitivity: 'paranoid',
      persona: { name: 'Gigi', age: 82, city: 'Halifax', grandkid: 'Max', quirks: 'baking bread' },
    });
    expect(await store.getSettings?.()).toEqual({
      protectedName: 'Rose',
      notifyOn: 'coach',
      contacts: [],
      model: 'gemini-3-pro-preview',
      voices: { grandma: 'v1', guardian: 'v2' },
      sensitivity: 'paranoid',
      persona: { name: 'Gigi', age: 82, city: 'Halifax', grandkid: 'Max', quirks: 'baking bread' },
    });
  });

  it('getSessionEvents queries by sessionId, sorted by ts ascending, and unwraps to bare events', async () => {
    const store = createMongoStore('mongodb://test');
    toArray.mockResolvedValueOnce([
      { sessionId: 's1', ts: 10, event: { type: 'risk', score: 5, ts: 10 } },
      { sessionId: 's1', ts: 20, event: { type: 'risk', score: 15, ts: 20 } },
    ]);
    const events = await store.getSessionEvents?.('s1');
    expect(events).toEqual([
      { type: 'risk', score: 5, ts: 10 },
      { type: 'risk', score: 15, ts: 20 },
    ]);
    expect(find).toHaveBeenCalledWith({ sessionId: 's1' });
    expect(sort).toHaveBeenCalledWith({ ts: 1 });
  });

  it('getSessionEvents returns [] and never throws when the query fails', async () => {
    const store = createMongoStore('mongodb://test');
    toArray.mockRejectedValueOnce(new Error('boom'));
    await expect(store.getSessionEvents?.('s1')).resolves.toEqual([]);
  });

  it('getAnalytics returns zeros gracefully when there are no finished sessions', async () => {
    const store = createMongoStore('mongodb://test');
    aggregateToArray.mockResolvedValueOnce([{ counts: [], tactics: [] }]);
    expect(await store.getAnalytics?.()).toEqual({
      totalCalls: 0,
      caught: 0,
      gaveUp: 0,
      catchRate: 0,
      avgTurnsToCatch: 0,
      avgMaxRisk: 0,
      tacticFrequency: [],
      totalAlertsSent: 0,
    });
  });

  it('getAnalytics returns zeros gracefully when the facet result is entirely empty', async () => {
    const store = createMongoStore('mongodb://test');
    aggregateToArray.mockResolvedValueOnce([]);
    expect(await store.getAnalytics?.()).toEqual({
      totalCalls: 0,
      caught: 0,
      gaveUp: 0,
      catchRate: 0,
      avgTurnsToCatch: 0,
      avgMaxRisk: 0,
      tacticFrequency: [],
      totalAlertsSent: 0,
    });
  });

  it('getAnalytics maps a populated aggregation result, including tactic labels', async () => {
    const store = createMongoStore('mongodb://test');
    aggregateToArray.mockResolvedValueOnce([
      {
        counts: [
          { totalCalls: 4, caught: 3, gaveUp: 1, turnsToCatchSum: 12, maxRiskSum: 300, alertsSentSum: 5 },
        ],
        tactics: [
          { _id: 'payment_redirection', count: 3 },
          { _id: 'urgency_pressure', count: 1 },
        ],
      },
    ]);
    const analytics = await store.getAnalytics?.();
    expect(analytics).toEqual({
      totalCalls: 4,
      caught: 3,
      gaveUp: 1,
      catchRate: 0.75,
      avgTurnsToCatch: 4,
      avgMaxRisk: 75,
      tacticFrequency: [
        { tactic: 'payment_redirection', label: 'Payment Redirection', count: 3 },
        { tactic: 'urgency_pressure', label: 'Urgency Pressure', count: 1 },
      ],
      totalAlertsSent: 5,
    });
  });

  it('getAnalytics returns zeros and never throws when the aggregation fails', async () => {
    const store = createMongoStore('mongodb://test');
    aggregateToArray.mockRejectedValueOnce(new Error('boom'));
    await expect(store.getAnalytics?.()).resolves.toEqual({
      totalCalls: 0,
      caught: 0,
      gaveUp: 0,
      catchRate: 0,
      avgTurnsToCatch: 0,
      avgMaxRisk: 0,
      tacticFrequency: [],
      totalAlertsSent: 0,
    });
  });
});
