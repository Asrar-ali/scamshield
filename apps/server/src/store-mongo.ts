import { MongoClient, type Collection } from 'mongodb';
import type { Event } from './types.js';
import { log } from './log.js';
import type { LeaderboardEntry, SessionRecord, Store } from './store.js';

const DB_NAME = process.env.MONGODB_DB ?? 'scamshield';

export function createMongoStore(uri: string): Store {
  const client = new MongoClient(uri);
  let connecting: Promise<{ sessions: Collection<SessionRecord>; events: Collection<StoredEvent> }> | null = null;

  interface StoredEvent {
    sessionId: string | undefined;
    event: Event;
    ts: number;
  }

  async function collections() {
    if (!connecting) {
      connecting = client
        .connect()
        .then(() => {
          const db = client.db(DB_NAME);
          return {
            sessions: db.collection<SessionRecord>('sessions'),
            events: db.collection<StoredEvent>('events'),
          };
        })
        .catch((err) => {
          connecting = null;
          throw err;
        });
    }
    return connecting;
  }

  function fireAndForget(op: Promise<unknown>, what: string) {
    op.catch((err) => log.warn(`Mongo store ${what} failed:`, err instanceof Error ? err.message : err));
  }

  return {
    saveSessionStart(record) {
      fireAndForget(
        collections().then(({ sessions }) => sessions.updateOne({ id: record.id }, { $set: record }, { upsert: true })),
        'saveSessionStart',
      );
    },
    saveSessionEnd(record) {
      fireAndForget(
        collections().then(({ sessions }) => sessions.updateOne({ id: record.id }, { $set: record }, { upsert: true })),
        'saveSessionEnd',
      );
    },
    saveEvent(sessionId, event) {
      fireAndForget(
        collections().then(({ events }) => events.insertOne({ sessionId, event, ts: Date.now() })),
        'saveEvent',
      );
    },
    async getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
      try {
        const { sessions } = await collections();
        const docs = await sessions
          .find({ outcome: { $in: ['caught', 'gave_up'] } })
          .sort({ turns: -1 })
          .limit(limit)
          .toArray();
        return docs.map((s) => ({
          sessionId: s.id,
          alias: s.alias,
          turns: s.turns,
          maxRisk: s.maxRisk,
          outcome: s.outcome as 'caught' | 'gave_up',
          ts: s.endedAt ?? s.startedAt,
        }));
      } catch (err) {
        log.warn('Mongo store getLeaderboard failed:', err instanceof Error ? err.message : err);
        return [];
      }
    },
  };
}
