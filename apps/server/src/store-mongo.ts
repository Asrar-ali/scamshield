import { MongoClient, type Collection } from 'mongodb';
import type { Event, Settings } from './types.js';
import { log } from './log.js';
import type { LeaderboardEntry, SessionRecord, Store } from './store.js';

const DB_NAME = process.env.MONGODB_DB ?? 'scamshield';
const SETTINGS_DOC_ID = 'singleton';

export function createMongoStore(uri: string): Store {
  const client = new MongoClient(uri);
  let connecting: Promise<{
    sessions: Collection<SessionRecord>;
    events: Collection<StoredEvent>;
    settings: Collection<StoredSettings>;
  }> | null = null;

  interface StoredEvent {
    sessionId: string | undefined;
    event: Event;
    ts: number;
  }

  interface StoredSettings extends Settings {
    _id: string;
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
            settings: db.collection<StoredSettings>('settings'),
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
    saveSettings(next) {
      fireAndForget(
        collections().then(({ settings }) =>
          settings.updateOne({ _id: SETTINGS_DOC_ID }, { $set: { ...next, _id: SETTINGS_DOC_ID } }, { upsert: true }),
        ),
        'saveSettings',
      );
    },
    async getSettings(): Promise<Settings | null> {
      try {
        const { settings } = await collections();
        const doc = await settings.findOne({ _id: SETTINGS_DOC_ID });
        if (!doc) return null;
        return { protectedName: doc.protectedName, notifyOn: doc.notifyOn, contacts: doc.contacts };
      } catch (err) {
        log.warn('Mongo store getSettings failed:', err instanceof Error ? err.message : err);
        return null;
      }
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
