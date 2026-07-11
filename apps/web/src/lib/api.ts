// Thin fetch wrappers around the server's REST contract.
// Every call is defensive: the server may be mid-implementation (parallel agent),
// so failures degrade gracefully instead of throwing into UI code.

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
