// Thin fetch wrappers around the server's REST contract.
// Every call is defensive: the server may be mid-implementation, so failures
// degrade gracefully instead of throwing into UI code.

import type { DeliveryChannel, Event, TacticId } from '../types';

export type LeaderboardOutcome = 'caught' | 'gave_up';

export interface LeaderboardEntry {
  sessionId: string;
  alias: string;
  turns: number;
  maxRisk: number;
  outcome: LeaderboardOutcome;
  ts: number;
}

// ---------------------------------------------------------------------------
// Analytics + session replay — feed the Threat Intel panel and the per-user
// detection history. Both degrade to a benign empty shape on any failure so the
// caller can hide the panel rather than render a broken box.
// ---------------------------------------------------------------------------

export interface TacticFrequency {
  tactic: TacticId;
  label: string;
  count: number;
}

export interface Analytics {
  totalCalls: number;
  caught: number;
  gaveUp: number;
  /** Fraction 0–1. */
  catchRate: number;
  avgTurnsToCatch: number;
  avgMaxRisk: number;
  tacticFrequency: TacticFrequency[];
  totalAlertsSent: number;
}

const EMPTY_ANALYTICS: Analytics = {
  totalCalls: 0,
  caught: 0,
  gaveUp: 0,
  catchRate: 0,
  avgTurnsToCatch: 0,
  avgMaxRisk: 0,
  tacticFrequency: [],
  totalAlertsSent: 0,
};

/** Returns zeroed analytics on any failure — the panel shows its empty state. */
export async function fetchAnalytics(): Promise<Analytics> {
  try {
    const res = await fetch('/api/analytics');
    if (!res.ok) return EMPTY_ANALYTICS;
    return (await res.json()) as Analytics;
  } catch {
    return EMPTY_ANALYTICS;
  }
}

/** Replay: the ordered event stream for a past session. Returns [] on failure
 * or for unknown/sparse sessions. */
export async function fetchSessionEvents(sessionId: string): Promise<Event[]> {
  try {
    const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}/events`);
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: Event[] };
    return data.events ?? [];
  } catch {
    return [];
  }
}

/** Returns [] on any failure — leaderboard is decorative, never blocking. */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: LeaderboardEntry[] };
    return data.entries ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Settings / Discord / delivery — every function here returns null (or a benign
// empty shape) on 404 / network failure so callers can render a "not connected"
// state instead of breaking.
// ---------------------------------------------------------------------------

export interface Contact {
  id: string;
  name: string;
  channel: DeliveryChannel;
  address: string;
}

export type Sensitivity = 'relaxed' | 'balanced' | 'paranoid';

/** Risk-score cutoff for the active sensitivity level. Read-only — server-computed. */
export interface Thresholds {
  flag: number;
}

export interface Settings {
  serverName: string;
  contacts: Contact[];
  model: string;
  sensitivity: Sensitivity;
  thresholds: Thresholds;
}

export interface RecentUser {
  userId: string;
  name: string;
  lastSeen: number;
}

export interface MonitoredUser {
  userId: string;
  name: string;
  risk: number;
  maxRisk: number;
  turns: number;
  tactics: string[];
  blocked: boolean;
}

export interface DiscordStatus {
  enabled: boolean;
  botTag: string | null;
  guildName: string | null;
  monitoredUsers: MonitoredUser[];
  recentUsers: RecentUser[];
}

export interface AlertTestDelivery {
  contact: string;
  channel: DeliveryChannel;
  ok: boolean;
  error?: string;
}

export interface AlertTestResponse {
  deliveries: AlertTestDelivery[];
}

/** Returns null when the endpoint 404s, is disabled, or the network fails. */
export async function fetchSettings(): Promise<Settings | null> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return null;
    return (await res.json()) as Settings;
  } catch {
    return null;
  }
}

/** Returns null on any failure — caller should keep the prior settings state. */
export async function updateSettings(settings: Settings): Promise<Settings | null> {
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) return null;
    return (await res.json()) as Settings;
  } catch {
    return null;
  }
}

const DISCORD_DISCONNECTED: DiscordStatus = { enabled: false, botTag: null, guildName: null, monitoredUsers: [], recentUsers: [] };

/** Never throws — a 404 or network failure reads the same as "not connected". */
export async function fetchDiscordStatus(): Promise<DiscordStatus> {
  try {
    const res = await fetch('/api/discord/status');
    if (!res.ok) return DISCORD_DISCONNECTED;
    return (await res.json()) as DiscordStatus;
  } catch {
    return DISCORD_DISCONNECTED;
  }
}

/** Returns null on any failure — caller shows "couldn't send test alert" inline. */
export async function postAlertTest(): Promise<AlertTestResponse | null> {
  try {
    const res = await fetch('/api/alert-test', { method: 'POST' });
    if (!res.ok) return null;
    return (await res.json()) as AlertTestResponse;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Models — feed the AI tab's model picker. Returns null on 404 / network failure
// so the picker can render disabled with an "unavailable" note.
// ---------------------------------------------------------------------------

export interface ModelInfo {
  id: string;
  label: string;
  source: string;
}

export interface ModelsResponse {
  active: string;
  models: ModelInfo[];
}

/** Returns null when the endpoint 404s or the network fails. */
export async function fetchModels(): Promise<ModelsResponse | null> {
  try {
    const res = await fetch('/api/models');
    if (!res.ok) return null;
    return (await res.json()) as ModelsResponse;
  } catch {
    return null;
  }
}
