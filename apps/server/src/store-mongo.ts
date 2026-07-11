import { MongoClient, type Collection } from 'mongodb';
import type { Event, Settings, TacticId } from './types.js';
import { log } from './log.js';
import { TACTIC_BY_ID } from './tactics.js';
import { emptyAnalytics, type AnalyticsSummary, type LeaderboardEntry, MAX_EVENTS_PER_SESSION, type SessionRecord, type Store } from './store.js';

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
        return {
          protectedName: doc.protectedName,
          notifyOn: doc.notifyOn,
          contacts: doc.contacts,
          model: doc.model,
          voices: doc.voices,
          sensitivity: doc.sensitivity,
          persona: doc.persona,
        };
      } catch (err) {
        log.warn('Mongo store getSettings failed:', err instanceof Error ? err.message : err);
        return null;
      }
    },
    async getSessionEvents(sessionId: string): Promise<Event[]> {
      try {
        const { events } = await collections();
        const docs = await events
          .find({ sessionId })
          .sort({ ts: 1 })
          .limit(MAX_EVENTS_PER_SESSION)
          .toArray();
        return docs.map((d) => d.event);
      } catch (err) {
        log.warn('Mongo store getSessionEvents failed:', err instanceof Error ? err.message : err);
        return [];
      }
    },
    async getAnalytics(): Promise<AnalyticsSummary> {
      try {
        const { sessions } = await collections();
        const [result] = (await sessions
          .aggregate([
            { $match: { outcome: { $in: ['caught', 'gave_up'] } } },
            {
              $facet: {
                counts: [
                  {
                    $group: {
                      _id: null,
                      totalCalls: { $sum: 1 },
                      caught: { $sum: { $cond: [{ $eq: ['$outcome', 'caught'] }, 1, 0] } },
                      gaveUp: { $sum: { $cond: [{ $eq: ['$outcome', 'gave_up'] }, 1, 0] } },
                      turnsToCatchSum: { $sum: { $cond: [{ $eq: ['$outcome', 'caught'] }, '$turns', 0] } },
                      maxRiskSum: { $sum: '$maxRisk' },
                      alertsSentSum: { $sum: { $ifNull: ['$alertsSent', 0] } },
                    },
                  },
                ],
                tactics: [{ $unwind: '$tactics' }, { $group: { _id: '$tactics', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
              },
            },
          ])
          .toArray()) as {
          counts?: {
            totalCalls: number;
            caught: number;
            gaveUp: number;
            turnsToCatchSum: number;
            maxRiskSum: number;
            alertsSentSum: number;
          }[];
          tactics?: { _id: string; count: number }[];
        }[];

        const c = result?.counts?.[0];
        if (!c) return emptyAnalytics();

        const totalCalls = c.totalCalls ?? 0;
        const caught = c.caught ?? 0;
        const gaveUp = c.gaveUp ?? 0;
        const catchRate = totalCalls > 0 ? caught / totalCalls : 0;
        const avgTurnsToCatch = caught > 0 ? (c.turnsToCatchSum ?? 0) / caught : 0;
        const avgMaxRisk = totalCalls > 0 ? (c.maxRiskSum ?? 0) / totalCalls : 0;
        const tacticFrequency = (result?.tactics ?? []).map((t) => ({
          tactic: t._id,
          label: TACTIC_BY_ID.get(t._id as TacticId)?.label ?? t._id,
          count: t.count,
        }));

        return {
          totalCalls,
          caught,
          gaveUp,
          catchRate,
          avgTurnsToCatch,
          avgMaxRisk,
          tacticFrequency,
          totalAlertsSent: c.alertsSentSum ?? 0,
        };
      } catch (err) {
        log.warn('Mongo store getAnalytics failed:', err instanceof Error ? err.message : err);
        return emptyAnalytics();
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
