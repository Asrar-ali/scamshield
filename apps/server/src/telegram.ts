import { log } from './log.js';

const API_BASE = 'https://api.telegram.org';
const POLL_TIMEOUT_S = 25;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export function telegramEnabled(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export interface RecentChat {
  chatId: string;
  name: string;
  lastSeen: number;
}

interface TelegramChat {
  id: number | string;
  type: string;
  first_name?: string;
}

interface TelegramMessage {
  chat: TelegramChat;
  text?: string;
  from?: { first_name?: string };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface GetUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
}

export interface ParsedUpdate {
  chatId: string;
  name: string;
  text: string;
}

export interface ParsedUpdatesResult {
  parsed: ParsedUpdate[];
  /** update_id of the last update seen + 1, or null if there was nothing to advance past. */
  nextOffset: number | null;
}

/** Pure parsing of a getUpdates response body — no I/O, easy to unit test. */
export function parseUpdates(data: GetUpdatesResponse): ParsedUpdatesResult {
  if (!data.ok || !data.result || data.result.length === 0) {
    return { parsed: [], nextOffset: null };
  }
  const parsed: ParsedUpdate[] = [];
  let nextOffset: number | null = null;
  for (const update of data.result) {
    nextOffset = update.update_id + 1;
    const msg = update.message;
    if (!msg?.chat || msg.chat.type !== 'private' || !msg.text?.trim()) continue;
    const chatId = String(msg.chat.id);
    const name = msg.chat.first_name ?? msg.from?.first_name ?? 'Family';
    parsed.push({ chatId, name, text: msg.text.trim() });
  }
  return { parsed, nextOffset };
}

async function fetchGetMe(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/bot${token}/getMe`);
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return data.ok ? (data.result?.username ?? null) : null;
  } catch (err) {
    log.warn('Telegram getMe failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchUpdates(token: string, offset: number): Promise<GetUpdatesResponse> {
  const res = await fetch(`${API_BASE}/bot${token}/getUpdates?timeout=${POLL_TIMEOUT_S}&offset=${offset}`);
  if (!res.ok) throw new Error(`getUpdates failed with ${res.status}`);
  return (await res.json()) as GetUpdatesResponse;
}

export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed with ${res.status}: ${body.slice(0, 300)}`);
  }
}

export interface TelegramCallbacks {
  /** Handle an incoming private-chat message; return the reply text to send back, or null to stay silent. */
  onMessage(chatId: string, name: string, text: string): Promise<string | null>;
}

export interface TelegramChannel {
  getBotUsername(): string | null;
  getRecentChats(): RecentChat[];
  stop(): void;
}

/**
 * Starts long-polling getUpdates when TELEGRAM_BOT_TOKEN is set. No-op (but still
 * returns a valid, "disabled" channel) when the token is absent — same pattern as
 * geminiEnabled()/ttsEnabled(). Never throws; poll errors are caught and retried
 * with exponential backoff so a flaky network never crashes the server.
 */
export function startTelegramChannel(callbacks: TelegramCallbacks): TelegramChannel {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const recent = new Map<string, RecentChat>();
  let botUsername: string | null = null;
  let stopped = false;
  let offset = 0;

  const channel: TelegramChannel = {
    getBotUsername: () => botUsername,
    getRecentChats: () => [...recent.values()],
    stop: () => {
      stopped = true;
    },
  };

  if (!token) return channel;
  // Re-bind as a plain string const — TS does not retain the `!token` narrowing
  // once `token` is captured by a nested function declared later in this scope.
  const botToken: string = token;

  async function processUpdate(update: ParsedUpdate): Promise<void> {
    recent.set(update.chatId, { chatId: update.chatId, name: update.name, lastSeen: Date.now() });
    try {
      const reply = await callbacks.onMessage(update.chatId, update.name, update.text);
      if (reply) await sendTelegramMessage(botToken, update.chatId, reply);
    } catch (err) {
      log.warn('Telegram message handler failed:', err instanceof Error ? err.message : err);
    }
  }

  async function poll(): Promise<void> {
    let backoff = INITIAL_BACKOFF_MS;
    while (!stopped) {
      try {
        const data = await fetchUpdates(botToken, offset);
        const { parsed, nextOffset } = parseUpdates(data);
        if (nextOffset !== null) offset = nextOffset;
        for (const update of parsed) {
          await processUpdate(update);
        }
        backoff = INITIAL_BACKOFF_MS;
      } catch (err) {
        log.warn('Telegram poll error, retrying with backoff:', err instanceof Error ? err.message : err);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }

  void fetchGetMe(botToken).then((username) => {
    botUsername = username;
  });
  void poll();

  return channel;
}
