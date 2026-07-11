import type { Event, Settings, TacticId } from './types.js';
import { log } from './log.js';
import { createMongoStore } from './store-mongo.js';
import { TACTIC_BY_ID } from './tactics.js';

export type SessionOutcome = 'in_progress' | 'caught' | 'gave_up';

export interface SessionRecord {
  id: string;
  alias: string;
  startedAt: number;
  endedAt: number | null;
  outcome: SessionOutcome;
  maxRisk: number;
  turns: number;
  tactics: string[];
  // Additive/optional: count of successfully-delivered family alerts for this
  // session, used by analytics. Absent on records written before this field
  // existed — treated as 0.
  alertsSent?: number;
}

export interface LeaderboardEntry {
  sessionId: string;
  alias: string;
  turns: number;
  maxRisk: number;
  outcome: 'caught' | 'gave_up';
  ts: number;
}

export const MAX_EVENTS_PER_SESSION = 500;

export interface TacticFrequency {
  tactic: string;
  label: string;
  count: number;
}

export interface AnalyticsSummary {
  totalCalls: number;
  caught: number;
  gaveUp: number;
  catchRate: number;
  avgTurnsToCatch: number;
  avgMaxRisk: number;
  tacticFrequency: TacticFrequency[];
  totalAlertsSent: number;
}

export function emptyAnalytics(): AnalyticsSummary {
  return { totalCalls: 0, caught: 0, gaveUp: 0, catchRate: 0, avgTurnsToCatch: 0, avgMaxRisk: 0, tacticFrequency: [], totalAlertsSent: 0 };
}

/** Pure aggregation over finished session records — shared by the in-memory store's
 * direct computation; Mongo instead runs an equivalent aggregation pipeline. */
export function computeAnalytics(records: SessionRecord[]): AnalyticsSummary {
  const finished = records.filter((r) => r.outcome !== 'in_progress');
  if (finished.length === 0) return emptyAnalytics();

  const caughtRecords = finished.filter((r) => r.outcome === 'caught');
  const totalCalls = finished.length;
  const caught = caughtRecords.length;
  const gaveUp = totalCalls - caught;
  const catchRate = totalCalls > 0 ? caught / totalCalls : 0;
  const avgTurnsToCatch = caught > 0 ? caughtRecords.reduce((sum, r) => sum + r.turns, 0) / caught : 0;
  const avgMaxRisk = totalCalls > 0 ? finished.reduce((sum, r) => sum + r.maxRisk, 0) / totalCalls : 0;

  const tacticCounts = new Map<string, number>();
  for (const r of finished) {
    for (const t of r.tactics) tacticCounts.set(t, (tacticCounts.get(t) ?? 0) + 1);
  }
  const tacticFrequency = [...tacticCounts.entries()]
    .map(([tactic, count]) => ({ tactic, label: TACTIC_BY_ID.get(tactic as TacticId)?.label ?? tactic, count }))
    .sort((a, b) => b.count - a.count);

  const totalAlertsSent = finished.reduce((sum, r) => sum + (r.alertsSent ?? 0), 0);

  return { totalCalls, caught, gaveUp, catchRate, avgTurnsToCatch, avgMaxRisk, tacticFrequency, totalAlertsSent };
}

export interface Store {
  saveSessionStart(record: SessionRecord): void;
  saveSessionEnd(record: SessionRecord): void;
  saveEvent(sessionId: string | undefined, event: Event): void;
  getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  // Additive/optional: settings persistence. Implementers (in-memory, Mongo) may
  // provide these; callers must not assume they exist (see settings.ts).
  saveSettings?(settings: Settings): void;
  getSettings?(): Promise<Settings | null>;
  // Additive/optional: session replay + analytics. Callers must not assume these
  // exist (mirrors saveSettings/getSettings above) — fall back to [] / zeros.
  getSessionEvents?(sessionId: string): Promise<Event[]>;
  getAnalytics?(): Promise<AnalyticsSummary>;
}

export function createInMemoryStore(): Store {
  const sessions = new Map<string, SessionRecord>();
  const sessionEvents = new Map<string, Event[]>();
  let settings: Settings | null = null;

  return {
    saveSessionStart(record) {
      sessions.set(record.id, record);
    },
    saveSessionEnd(record) {
      sessions.set(record.id, record);
    },
    saveEvent(sessionId, event) {
      if (!sessionId) return;
      const list = sessionEvents.get(sessionId) ?? [];
      list.push(event);
      if (list.length > MAX_EVENTS_PER_SESSION) list.splice(0, list.length - MAX_EVENTS_PER_SESSION);
      sessionEvents.set(sessionId, list);
    },
    saveSettings(next) {
      settings = next;
    },
    async getSettings() {
      return settings;
    },
    async getSessionEvents(sessionId) {
      return [...(sessionEvents.get(sessionId) ?? [])].sort((a, b) => a.ts - b.ts);
    },
    async getAnalytics() {
      return computeAnalytics([...sessions.values()]);
    },
    async getLeaderboard(limit = 10) {
      return [...sessions.values()]
        .filter((s): s is SessionRecord & { outcome: 'caught' | 'gave_up' } => s.outcome !== 'in_progress')
        .sort((a, b) => b.turns - a.turns)
        .slice(0, limit)
        .map((s) => ({
          sessionId: s.id,
          alias: s.alias,
          turns: s.turns,
          maxRisk: s.maxRisk,
          outcome: s.outcome,
          ts: s.endedAt ?? s.startedAt,
        }));
    },
  };
}

export function createStore(): Store {
  const uri = process.env.MONGODB_URI;
  if (!uri) return createInMemoryStore();
  try {
    return createMongoStore(uri);
  } catch (err) {
    log.warn('Falling back to in-memory store:', err instanceof Error ? err.message : err);
    return createInMemoryStore();
  }
}
