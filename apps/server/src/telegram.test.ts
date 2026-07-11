import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseUpdates, sendTelegramMessage, startTelegramChannel, telegramEnabled, type TelegramChannel } from './telegram.js';

const originalFetch = global.fetch;

describe('telegramEnabled', () => {
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it('is false when no token is set', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(telegramEnabled()).toBe(false);
  });

  it('is true when a token is set', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    expect(telegramEnabled()).toBe(true);
  });
});

describe('parseUpdates', () => {
  it('returns empty with a null offset when the response is not ok', () => {
    expect(parseUpdates({ ok: false })).toEqual({ parsed: [], nextOffset: null });
  });

  it('returns empty with a null offset when there is no result', () => {
    expect(parseUpdates({ ok: true })).toEqual({ parsed: [], nextOffset: null });
    expect(parseUpdates({ ok: true, result: [] })).toEqual({ parsed: [], nextOffset: null });
  });

  it('parses a private text message', () => {
    const { parsed, nextOffset } = parseUpdates({
      ok: true,
      result: [{ update_id: 10, message: { chat: { id: 42, type: 'private', first_name: 'Sarah' }, text: 'hi there' } }],
    });
    expect(parsed).toEqual([{ chatId: '42', name: 'Sarah', text: 'hi there' }]);
    expect(nextOffset).toBe(11);
  });

  it('advances the offset past a filtered-out update (group chat)', () => {
    const { parsed, nextOffset } = parseUpdates({
      ok: true,
      result: [{ update_id: 7, message: { chat: { id: 1, type: 'group' }, text: 'hi' } }],
    });
    expect(parsed).toEqual([]);
    expect(nextOffset).toBe(8);
  });

  it('filters out messages with no text or whitespace-only text', () => {
    const { parsed, nextOffset } = parseUpdates({
      ok: true,
      result: [
        { update_id: 1, message: { chat: { id: 1, type: 'private' } } },
        { update_id: 2, message: { chat: { id: 1, type: 'private' }, text: '   ' } },
      ],
    });
    expect(parsed).toEqual([]);
    expect(nextOffset).toBe(3);
  });

  it('falls back to from.first_name then "Family" when chat has no first_name', () => {
    const withFrom = parseUpdates({
      ok: true,
      result: [{ update_id: 1, message: { chat: { id: 1, type: 'private' }, from: { first_name: 'Tom' }, text: 'hi' } }],
    });
    expect(withFrom.parsed[0].name).toBe('Tom');

    const withNeither = parseUpdates({
      ok: true,
      result: [{ update_id: 1, message: { chat: { id: 1, type: 'private' }, text: 'hi' } }],
    });
    expect(withNeither.parsed[0].name).toBe('Family');
  });

  it('trims message text', () => {
    const { parsed } = parseUpdates({
      ok: true,
      result: [{ update_id: 1, message: { chat: { id: 1, type: 'private' }, text: '  hello  ' } }],
    });
    expect(parsed[0].text).toBe('hello');
  });
});

describe('sendTelegramMessage', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts to the sendMessage endpoint and resolves on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    await sendTelegramMessage('tok', '42', 'hello');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottok/sendMessage',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ chat_id: '42', text: 'hello' });
  });

  it('throws when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' }) as unknown as typeof fetch;
    await expect(sendTelegramMessage('tok', '42', 'hi')).rejects.toThrow('Telegram sendMessage failed with 403');
  });
});

describe('startTelegramChannel', () => {
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns a disabled channel and never calls fetch when no token is set', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const channel = startTelegramChannel({ onMessage: vi.fn() });
    expect(channel.getBotUsername()).toBeNull();
    expect(channel.getRecentChats()).toEqual([]);
    expect(() => channel.stop()).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls, tracks the bot username, processes a message, advances the offset, and replies', async () => {
    vi.useFakeTimers();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    const onMessage = vi.fn().mockResolvedValue('Hello dear, who is calling?');
    let channelRef: TelegramChannel | undefined;

    const fetchMock = vi
      .fn()
      // getMe
      .mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ok: true, result: { username: 'RoseBot' } }) }))
      // first getUpdates: one private message
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          result: [{ update_id: 5, message: { chat: { id: 111, type: 'private', first_name: 'Sarah' }, text: 'hello' } }],
        }),
      }))
      // sendMessage reply
      .mockImplementationOnce(async () => ({ ok: true }))
      // second getUpdates: stop the loop here
      .mockImplementationOnce(async () => {
        channelRef?.stop();
        return { ok: true, json: async () => ({ ok: true, result: [] }) };
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const channel = startTelegramChannel({ onMessage });
    channelRef = channel;

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(onMessage).toHaveBeenCalledWith('111', 'Sarah', 'hello');
    expect(channel.getBotUsername()).toBe('RoseBot');
    expect(channel.getRecentChats()).toEqual([{ chatId: '111', name: 'Sarah', lastSeen: expect.any(Number) }]);

    const sendCall = fetchMock.mock.calls[2];
    expect(sendCall[0]).toBe('https://api.telegram.org/bottest-token/sendMessage');
    expect(JSON.parse((sendCall[1] as RequestInit).body as string)).toEqual({ chat_id: '111', text: 'Hello dear, who is calling?' });

    const secondGetUpdatesUrl = fetchMock.mock.calls[3][0] as string;
    expect(secondGetUpdatesUrl).toContain('offset=6');
  });

  it('does not reply when onMessage resolves null', async () => {
    vi.useFakeTimers();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    const onMessage = vi.fn().mockResolvedValue(null);
    let channelRef: TelegramChannel | undefined;

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ok: true, result: {} }) })) // getMe
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          result: [{ update_id: 1, message: { chat: { id: 9, type: 'private' }, text: 'hi' } }],
        }),
      }))
      .mockImplementationOnce(async () => {
        channelRef?.stop();
        return { ok: true, json: async () => ({ ok: true, result: [] }) };
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const channel = startTelegramChannel({ onMessage });
    channelRef = channel;
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(onMessage).toHaveBeenCalled();
    // getMe + getUpdates + getUpdates(stop) = 3 calls; no sendMessage call was made
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries getUpdates with backoff after an error and never crashes', async () => {
    vi.useFakeTimers();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    let channelRef: TelegramChannel | undefined;

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ok: true, result: {} }) })) // getMe
      .mockImplementationOnce(async () => {
        throw new Error('network down');
      }) // first getUpdates fails
      .mockImplementationOnce(async () => {
        channelRef?.stop();
        return { ok: true, json: async () => ({ ok: true, result: [] }) };
      }); // second getUpdates succeeds and stops
    global.fetch = fetchMock as unknown as typeof fetch;

    const channel = startTelegramChannel({ onMessage: vi.fn() });
    channelRef = channel;

    // flush getMe + first (failing) getUpdates
    await vi.advanceTimersByTimeAsync(0);
    // flush the backoff timer (1s) and the retry
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
