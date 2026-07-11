import type { Event, Settings } from './types.js';
import { log } from './log.js';
import { createMongoStore } from './store-mongo.js';

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
}

export interface LeaderboardEntry {
  sessionId: string;
  alias: string;
  turns: number;
  maxRisk: number;
  outcome: 'caught' | 'gave_up';
  ts: number;
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
}

export function createInMemoryStore(): Store {
  const sessions = new Map<string, SessionRecord>();
  const events: { sessionId: string | undefined; event: Event }[] = [];
  let settings: Settings | null = null;

  return {
    saveSessionStart(record) {
      sessions.set(record.id, record);
    },
    saveSessionEnd(record) {
      sessions.set(record.id, record);
    },
    saveEvent(sessionId, event) {
      events.push({ sessionId, event });
    },
    saveSettings(next) {
      settings = next;
    },
    async getSettings() {
      return settings;
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
