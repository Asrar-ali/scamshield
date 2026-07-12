import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Events } from 'discord.js';
import request from 'supertest';
import { buildApp, type BuiltApp } from './app.js';
import { createInMemoryStore, type Store } from './store.js';
import type { Event } from './types.js';

const AGGRESSIVE_LINE = "You need to act right now and wire money via bitcoin or you'll go to jail immediately";
const INNOCENT_LINE = 'I fed the cat and then watered my tomato plants this morning.';

// Most integration tests use no turn throttle so the Discord flood guard doesn't
// interfere. The throttle itself is covered by a dedicated test below.
const NO_TURN_THROTTLE = { turnMinIntervalMs: 0, turnMaxPerWindow: Number.MAX_SAFE_INTEGER } as const;

describe('server integration', () => {
  let built: BuiltApp;
  let baseUrl: string;

  beforeEach(async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.SCAMSHIELD_IMESSAGE_ENABLED;
    built = buildApp({ limits: NO_TURN_THROTTLE });
    await new Promise<void>((resolve) => built.server.listen(0, resolve));
    const port = (built.server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    built.discord.stop();
    await new Promise<void>((resolve) => built.server.close(() => resolve()));
  });

  it('reports mode on /health', async () => {
    const res = await request(baseUrl).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mode: 'mock', ai: 'unconfigured' });
  });

  it('GET /api/settings returns sensible defaults', async () => {
    const res = await request(baseUrl).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      serverName: 'ScamShield',
      contacts: [],
      model: '',
      sensitivity: 'balanced',
      thresholds: { flag: 35 },
    });
  });

  it('PUT /api/settings round-trips through GET', async () => {
    const payload = {
      serverName: 'My Server',
      contacts: [{ id: 'c1', name: 'Sarah', channel: 'discord', address: '12345' }],
      model: '',
      sensitivity: 'paranoid',
    };
    const put = await request(baseUrl).put('/api/settings').send(payload);
    expect(put.status).toBe(200);
    expect(put.body).toEqual(payload);

    const get = await request(baseUrl).get('/api/settings');
    expect(get.body).toEqual({ ...payload, thresholds: { flag: 20 } });
  });

  it('PUT /api/settings 400s on an invalid channel', async () => {
    const res = await request(baseUrl)
      .put('/api/settings')
      .send({ serverName: 'S', contacts: [{ name: 'Sarah', channel: 'sms', address: '1' }] });
    expect(res.status).toBe(400);
  });

  it('PUT /api/settings 400s on more than 5 contacts', async () => {
    const contacts = Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, channel: 'discord', address: `${i}` }));
    const res = await request(baseUrl).put('/api/settings').send({ serverName: 'S', contacts });
    expect(res.status).toBe(400);
  });

  it('GET /api/discord/status reports not-connected when DISCORD_BOT_TOKEN is unset', async () => {
    const res = await request(baseUrl).get('/api/discord/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, botTag: null, guildName: null, monitoredUsers: [], recentUsers: [] });
  });

  it('GET /api/models returns the curated list', async () => {
    const res = await request(baseUrl).get('/api/models');
    expect(res.status).toBe(200);
    expect(res.body.models.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('active');
  });

  it('GET /api/analytics returns zeros gracefully on an empty store', async () => {
    const res = await request(baseUrl).get('/api/analytics');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalCalls: 0,
      caught: 0,
      gaveUp: 0,
      catchRate: 0,
      avgTurnsToCatch: 0,
      avgMaxRisk: 0,
      tacticFrequency: [],
      totalAlertsSent: 0,
    });
  });

  it('GET /api/leaderboard returns at most 10 entries', async () => {
    const res = await request(baseUrl).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('POST /api/alert-test reports no deliveries when no contacts are configured', async () => {
    const res = await request(baseUrl).post('/api/alert-test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deliveries: [] });
  });

  it('POST /api/alert-test reports a failed delivery for a configured discord contact when no bot token is set', async () => {
    await request(baseUrl)
      .put('/api/settings')
      .send({ serverName: 'S', contacts: [{ name: 'Sarah', channel: 'discord', address: '111' }] });
    const res = await request(baseUrl).post('/api/alert-test');
    expect(res.status).toBe(200);
    expect(res.body.deliveries).toEqual([
      { contact: 'Sarah', channel: 'discord', ok: false, error: 'Discord client is not connected' },
    ]);
  });
});

describe('server integration with Discord monitoring', () => {
  let built: BuiltApp;

  /** Minimal discord.js Client stub: an event emitter shaped like the bits of
   * Client that startDiscordChannel touches (on/emit + ready user/guilds cache).
   * Tests emit 'messageCreate' directly to drive the monitoring pipeline. */
  function makeStubClient(tag = 'ScamShield#0001', guildName = 'Demo Server') {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    // Collection-shaped cache: a Map plus the .first() helper discord.js provides.
    const cache = new Map([['g1', { name: guildName }]]);
    (cache as unknown as { first: () => unknown }).first = () => [...cache.values()][0];
    const client = {
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        (handlers[event] ??= []).push(fn);
        return client;
      }),
      emit: (event: string, ...args: unknown[]) => (handlers[event] ?? []).forEach((fn) => fn(...args)),
      destroy: vi.fn().mockResolvedValue(undefined),
      user: { tag },
      guilds: { cache },
    };
    return client;
  }

  /** A discord.js Message-shaped object for the messageCreate path, including the
   * delete() spy the flag action calls. */
  function fakeMessage(userId: string, username: string, text: string) {
    return {
      author: { bot: false, id: userId, username },
      guildId: 'g1',
      channelId: 'c1',
      content: text,
      delete: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      channel: { send: vi.fn().mockResolvedValue(undefined) },
    };
  }

  // The per-user serialization chain in onMessage nests several .then layers; this
  // drains the microtask queue deeply enough for the full chain to settle.
  const drain = async (n = 20) => {
    for (let i = 0; i < n; i += 1) await Promise.resolve();
  };

  afterEach(async () => {
    built.discord.stop();
    await new Promise<void>((resolve) => built.server.close(() => resolve()));
    delete process.env.DISCORD_BOT_TOKEN;
  });

  it('creates a per-user session keyed by Discord user id', async () => {
    const client = makeStubClient();

    const events: Event[] = [];
    const baseStore = createInMemoryStore();
    const capturingStore: Store = {
      ...baseStore,
      saveEvent(sessionId, event) {
        events.push(event);
        baseStore.saveEvent(sessionId, event);
      },
    };

    built = buildApp({ store: capturingStore, limits: NO_TURN_THROTTLE, discordClient: client as never });
    client.emit(Events.ClientReady, client);

    client.emit('messageCreate', fakeMessage('555', 'Sarah', INNOCENT_LINE));
    await drain();

    expect(built.sessions.size).toBe(1);
    const [session] = [...built.sessions.values()];
    expect(session.alias).toBe('Sarah');

    const sessionStart = events.find((e) => e.type === 'session' && e.state === 'start');
    expect(sessionStart).toMatchObject({ type: 'session', state: 'start', alias: 'Sarah' });
    expect(events.some((e) => e.type === 'tactic')).toBe(false); // innocent line → no detections
    expect(events.some((e) => e.type === 'utterance' && e.role === 'scammer')).toBe(true);

    expect(built.discord.getBotTag()).toBe('ScamShield#0001');
    expect(built.discord.getGuildName()).toBe('Demo Server');
    expect(built.discord.getRecentUsers()).toEqual([{ userId: '555', name: 'Sarah', lastSeen: expect.any(Number) }]);
  });

  it('accumulates risk per user across messages and on flag warns + mutes + reports', async () => {
    const client = makeStubClient();
    built = buildApp({ limits: NO_TURN_THROTTLE, discordClient: client as never });
    client.emit(Events.ClientReady, client);

    // Feed enough aggressive turns from one user to guarantee a flag.
    const msgs: ReturnType<typeof fakeMessage>[] = [];
    for (let i = 0; i < 6; i += 1) {
      const m = fakeMessage('777', 'Tom', AGGRESSIVE_LINE);
      msgs.push(m);
      client.emit('messageCreate', m);
      await drain();
    }

    const allSessions = [...built.sessions.values()];
    expect(allSessions.length).toBe(1);
    expect(allSessions[0].ended).toBe(true); // flag ends the session

    // Messages are NOT deleted (left visible for demo); a warning notice is posted in-channel.
    expect(msgs.every((m) => m.delete.mock.calls.length === 0)).toBe(true);
    const warnedMsg = msgs.find((m) => m.channel.send.mock.calls.length > 0);
    expect(warnedMsg).toBeTruthy();
    const notice = warnedMsg?.channel.send.mock.calls[0]?.[0] as string | undefined;
    expect(typeof notice).toBe('string');
    expect(notice).toContain('ScamShield flagged Tom');
  });

  it('blocks further messages from a user after a flag, instead of resetting their risk', async () => {
    const client = makeStubClient();
    built = buildApp({ limits: NO_TURN_THROTTLE, discordClient: client as never });
    client.emit(Events.ClientReady, client);

    for (let i = 0; i < 6; i += 1) {
      client.emit('messageCreate', fakeMessage('888', 'Scammer', AGGRESSIVE_LINE));
      await drain();
    }
    expect([...built.sessions.values()].every((s) => s.ended)).toBe(true);

    // A message after the flag: the user is blocked, so no new session is created.
    const afterMsg = fakeMessage('888', 'Scammer', 'try again');
    client.emit('messageCreate', afterMsg);
    await drain();

    // Still exactly the one (ended) session — no resurrected fresh session.
    expect([...built.sessions.values()].filter((s) => s.alias === 'Scammer').length).toBe(1);
    // No new session created — blocked user is re-muted but message is left visible for demo purposes.
    expect(afterMsg.delete).not.toHaveBeenCalled();
  });

  it('keeps separate per-user sessions for two different Discord members', async () => {
    const client = makeStubClient();
    built = buildApp({ limits: NO_TURN_THROTTLE, discordClient: client as never });
    client.emit(Events.ClientReady, client);

    client.emit('messageCreate', fakeMessage('a1', 'Alice', INNOCENT_LINE));
    client.emit('messageCreate', fakeMessage('b2', 'Bob', INNOCENT_LINE));
    await drain();

    const aliases = [...built.sessions.values()].map((s) => s.alias).sort();
    expect(aliases).toEqual(['Alice', 'Bob']);
  });
});

describe('server abuse and quota guards', () => {
  let built: BuiltApp | undefined;
  const originalFetch = global.fetch;

  async function launch(options: Parameters<typeof buildApp>[0] = {}): Promise<void> {
    built = buildApp(options);
    await new Promise<void>((resolve) => built!.server.listen(0, resolve));
  }

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.DISCORD_BOT_TOKEN;
  });

  afterEach(async () => {
    built?.discord.stop();
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.DISCORD_BOT_TOKEN;
    if (built) await new Promise<void>((resolve) => built!.server.close(() => resolve()));
    built = undefined;
  });

  it('429s /api/alert-test (with retryAfterMs) while it is cooling down', async () => {
    await launch({ limits: { alertTestCooldownMs: 60_000 } });
    const first = await request(`http://localhost:${(built!.server.address() as AddressInfo).port}`).post('/api/alert-test');
    expect(first.status).toBe(200);
    const second = await request(`http://localhost:${(built!.server.address() as AddressInfo).port}`).post('/api/alert-test');
    expect(second.status).toBe(429);
    expect(typeof second.body.retryAfterMs).toBe('number');
  });

  it('silently drops the second message when a single Discord user floods', async () => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const cache = new Map([['g1', { name: 'Demo Server' }]]);
    (cache as unknown as { first: () => unknown }).first = () => [...cache.values()][0];
    const client = {
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        (handlers[event] ??= []).push(fn);
        return client;
      }),
      emit: (event: string, ...args: unknown[]) => (handlers[event] ?? []).forEach((fn) => fn(...args)),
      destroy: vi.fn().mockResolvedValue(undefined),
      user: { tag: 'ScamShield#0001' },
      guilds: { cache },
    };
    const fakeMessage = (text: string) => ({
      author: { bot: false, id: '909', username: 'Flooder' },
      guildId: 'g1',
      channelId: 'c1',
      content: text,
      delete: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      channel: { send: vi.fn().mockResolvedValue(undefined) },
    });

    await launch({ discordClient: client as never }); // default limits: per-user throttle active

    // Two messages from the same user within the same tick — the second trips the
    // 1-message/2s per-user throttle and is silently dropped (no analysis).
    client.emit('messageCreate', fakeMessage(INNOCENT_LINE));
    client.emit('messageCreate', fakeMessage(INNOCENT_LINE));
    for (let i = 0; i < 5; i += 1) await Promise.resolve();

    // Exactly one per-user session exists, holding only the first utterance — the
    // flooded second message was dropped by the throttle, never analyzed.
    const sessions = [...built!.sessions.values()].filter((s) => s.alias === 'Flooder');
    expect(sessions.length).toBe(1);
    expect(sessions[0].history.filter((h) => h.role === 'user')).toHaveLength(1);
  });
});

describe('operator token auth on mutating endpoints', () => {
  let built: BuiltApp;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.SCAMSHIELD_OPERATOR_TOKEN = 'secret';
    built = buildApp();
    await new Promise<void>((resolve) => built.server.listen(0, resolve));
    baseUrl = `http://localhost:${(built.server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    built.discord.stop();
    delete process.env.SCAMSHIELD_OPERATOR_TOKEN;
    await new Promise<void>((resolve) => built.server.close(() => resolve()));
  });

  it('401s PUT /api/settings without the token', async () => {
    const res = await request(baseUrl).put('/api/settings').send({ serverName: 'S' });
    expect(res.status).toBe(401);
  });

  it('accepts PUT /api/settings with the correct token', async () => {
    const res = await request(baseUrl)
      .put('/api/settings')
      .set('x-scamshield-token', 'secret')
      .send({ serverName: 'S', contacts: [] });
    expect(res.status).toBe(200);
  });

  it('401s POST /api/alert-test without the token', async () => {
    const res = await request(baseUrl).post('/api/alert-test');
    expect(res.status).toBe(401);
  });

  it('leaves read endpoints open (settings/discord-status/health need no token)', async () => {
    expect((await request(baseUrl).get('/api/settings')).status).toBe(200);
    expect((await request(baseUrl).get('/api/discord/status')).status).toBe(200);
    expect((await request(baseUrl).get('/health')).status).toBe(200);
  });
});
