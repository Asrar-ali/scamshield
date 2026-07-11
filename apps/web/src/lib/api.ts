// Thin fetch wrappers around the server's REST contract.
// Every call is defensive: the server may be mid-implementation (parallel agent),
// so failures degrade gracefully instead of throwing into UI code.

import type { DeliveryChannel } from '../types';

export interface StartSessionResponse {
  sessionId: string;
}

export interface TurnResponse {
  ended: boolean;
  risk: number;
  reply?: string;
}

export type LeaderboardOutcome = 'caught' | 'gave_up';

export interface LeaderboardEntry {
  sessionId: string;
  alias: string;
  turns: number;
  maxRisk: number;
  outcome: LeaderboardOutcome;
  ts: number;
}

export type TtsRole = 'grandma' | 'guardian';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

export async function startSession(alias: string): Promise<StartSessionResponse> {
  return postJson<StartSessionResponse>('/api/session/start', { alias });
}

export async function sendTurn(sessionId: string, text: string): Promise<TurnResponse> {
  return postJson<TurnResponse>('/api/turn', { sessionId, text });
}

/** "Give up" — manual end. Best-effort: caller should not block UX on failure. */
export async function endSession(sessionId: string): Promise<void> {
  await fetch(`/api/session/${encodeURIComponent(sessionId)}/end`, { method: 'POST' });
}

/**
 * Fetch TTS audio for a line. Returns the audio Blob on success, or null when the
 * server signals fallback (503 / {fallback:true}) or the request fails outright —
 * callers should use speechSynthesis in the null case.
 */
export async function fetchTts(text: string, role: TtsRole): Promise<Blob | null> {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, role }),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('audio')) return null;
    return await res.blob();
  } catch {
    return null;
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
// Settings / Telegram / delivery — new surfaces. Every function here returns
// null (or a benign empty shape) on 404 / network failure so callers can
// render a "not connected" state instead of breaking.
// ---------------------------------------------------------------------------

export type NotifyOn = 'coach' | 'takeover';

export interface Contact {
  id: string;
  name: string;
  channel: DeliveryChannel;
  address: string;
}

export interface Settings {
  protectedName: string;
  notifyOn: NotifyOn;
  contacts: Contact[];
}

export interface TelegramChat {
  chatId: string;
  name: string;
  lastSeen: number;
}

export interface TelegramStatus {
  enabled: boolean;
  botUsername: string | null;
  recentChats: TelegramChat[];
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

const TELEGRAM_DISCONNECTED: TelegramStatus = { enabled: false, botUsername: null, recentChats: [] };

/** Never throws — a 404 or network failure reads the same as "not connected". */
export async function fetchTelegramStatus(): Promise<TelegramStatus> {
  try {
    const res = await fetch('/api/telegram/status');
    if (!res.ok) return TELEGRAM_DISCONNECTED;
    return (await res.json()) as TelegramStatus;
  } catch {
    return TELEGRAM_DISCONNECTED;
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
