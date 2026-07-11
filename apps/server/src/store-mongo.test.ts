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
const collection = vi.fn().mockReturnValue({ updateOne, insertOne, find, findOne });
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
    store.saveSettings?.({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [] });
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
    expect(() => store.saveSettings?.({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [] })).not.toThrow();
    await flush();
  });
});
