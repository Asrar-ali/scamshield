import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { buildApp, type BuiltApp } from './app.js';
import { createInMemoryStore, type Store } from './store.js';
import { resetVoicesCache } from './tts.js';
import type { Event } from './types.js';

const AGGRESSIVE_LINE = "You need to act right now and wire money via bitcoin or you'll go to jail immediately";
const INNOCENT_LINE = 'I fed the cat and then watered my tomato plants this morning.';

describe('server integration', () => {
  let built: BuiltApp;
  let baseUrl: string;
  let sockets: WebSocket[];

  beforeEach(async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.MONGODB_URI;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.SCAMSHIELD_IMESSAGE_ENABLED;
    built = buildApp();
    sockets = [];
    await new Promise<void>((resolve) => built.server.listen(0, resolve));
    const port = (built.server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    for (const ws of sockets) ws.terminate();
    built.telegram.stop();
    await new Promise<void>((resolve) => built.server.close(() => resolve()));
  });

  async function connectSocket(): Promise<{ events: Event[]; ws: WebSocket }> {
    const port = (built.server.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    sockets.push(ws);
    const events: Event[] = [];
    ws.on('message', (data) => events.push(JSON.parse(data.toString()) as Event));
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));
    return { events, ws };
  }

  it('starts a session with a default alias when none is given', async () => {
    const res = await request(baseUrl).post('/api/session/start').send({});
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.alias).toBe('Anonymous Scammer');
  });

  it('starts a session with a sanitized custom alias', async () => {
    const res = await request(baseUrl)
      .post('/api/session/start')
      .send({ alias: '  Scammer Steve  '.padEnd(40, 'x') });
    expect(res.status).toBe(200);
    expect(res.body.alias.length).toBeLessThanOrEqual(24);
  });

  it('400s on missing fields for /api/turn', async () => {
    const res = await request(baseUrl).post('/api/turn').send({ text: 'hello' });
    expect(res.status).toBe(400);
  });

  it('404s on an unknown session for /api/turn', async () => {
    const res = await request(baseUrl).post('/api/turn').send({ sessionId: 'does-not-exist', text: 'hello' });
    expect(res.status).toBe(404);
  });

  it('404s on an unknown session for /api/session/:id/end', async () => {
    const res = await request(baseUrl).post('/api/session/does-not-exist/end');
    expect(res.status).toBe(404);
  });

  it('keeps a clean conversation low-risk and replies as grandma', async () => {
    const start = await request(baseUrl).post('/api/session/start').send({});
    const sessionId = start.body.sessionId as string;

    for (let i = 0; i < 3; i += 1) {
      const res = await request(baseUrl).post('/api/turn').send({ sessionId, text: INNOCENT_LINE });
      expect(res.status).toBe(200);
      expect(res.body.ended).toBe(false);
      expect(res.body.risk).toBe(0);
      expect(typeof res.body.reply).toBe('string');
      expect(res.body.reply.length).toBeGreaterThan(0);
    }
  });

  it('fires the coach before the takeover in an aggressive escalation, then locks the session', async () => {
    const { events } = await connectSocket();
    const start = await request(baseUrl).post('/api/session/start').send({});
    const sessionId = start.body.sessionId as string;

    let ended = false;
    for (let i = 0; i < 6 && !ended; i += 1) {
      const res = await request(baseUrl).post('/api/turn').send({ sessionId, text: AGGRESSIVE_LINE });
      expect(res.status).toBe(200);
      ended = res.body.ended === true;
    }
    expect(ended).toBe(true);

    const coachIndex = events.findIndex((e) => e.type === 'intervention' && e.level === 'coach');
    const takeoverIndex = events.findIndex((e) => e.type === 'intervention' && e.level === 'takeover');
    expect(coachIndex).toBeGreaterThanOrEqual(0);
    expect(takeoverIndex).toBeGreaterThan(coachIndex);

    const followUp = await request(baseUrl).post('/api/turn').send({ sessionId, text: AGGRESSIVE_LINE });
    expect(followUp.status).toBe(409);
  });

  it('manually ends a session via POST /api/session/:id/end', async () => {
    const start = await request(baseUrl).post('/api/session/start').send({});
    const sessionId = start.body.sessionId as string;
    const res = await request(baseUrl).post(`/api/session/${sessionId}/end`);
    expect(res.status).toBe(200);
    expect(res.body.ended).toBe(true);

    const turnRes = await request(baseUrl).post('/api/turn').send({ sessionId, text: INNOCENT_LINE });
    expect(turnRes.status).toBe(409);
  });

  it('returns 503 {fallback:true} from /api/tts when keyless', async () => {
    const res = await request(baseUrl).post('/api/tts').send({ text: 'hello there', role: 'grandma' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ fallback: true });
  });

  it('400s /api/tts on missing or invalid fields', async () => {
    const missingText = await request(baseUrl).post('/api/tts').send({ role: 'grandma' });
    expect(missingText.status).toBe(400);
    const badRole = await request(baseUrl).post('/api/tts').send({ text: 'hi', role: 'villain' });
    expect(badRole.status).toBe(400);
  });

  it('reflects a finished session on the leaderboard', async () => {
    const start = await request(baseUrl).post('/api/session/start').send({ alias: 'Leaderboard Tester' });
    const sessionId = start.body.sessionId as string;
    await request(baseUrl).post('/api/turn').send({ sessionId, text: INNOCENT_LINE });
    await request(baseUrl).post(`/api/session/${sessionId}/end`);

    const res = await request(baseUrl).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    const entry = res.body.entries.find((e: { sessionId: string }) => e.sessionId === sessionId);
    expect(entry).toMatchObject({ alias: 'Leaderboard Tester', outcome: 'gave_up', turns: 1 });
  });

  it('returns at most 10 leaderboard entries sorted by turns descending', async () => {
    for (let i = 0; i < 3; i += 1) {
      const start = await request(baseUrl).post('/api/session/start').send({});
      const sessionId = start.body.sessionId as string;
      for (let t = 0; t <= i; t += 1) {
        await request(baseUrl).post('/api/turn').send({ sessionId, text: INNOCENT_LINE });
      }
      await request(baseUrl).post(`/api/session/${sessionId}/end`);
    }
    const res = await request(baseUrl).get('/api/leaderboard');
    const turns = res.body.entries.map((e: { turns: number }) => e.turns);
    const sorted = [...turns].sort((a, b) => b - a);
    expect(turns).toEqual(sorted);
    expect(res.body.entries.length).toBeLessThanOrEqual(10);
  });

  it('reports mode on /health', async () => {
    const res = await request(baseUrl).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mode: 'mock', ai: 'unconfigured' });
  });

  it('broadcasts a session-start event with dashboard channel and alias', async () => {
    const { events } = await connectSocket();
    await request(baseUrl).post('/api/session/start').send({ alias: 'Steve' });
    const start = events.find((e) => e.type === 'session' && e.state === 'start');
    expect(start).toMatchObject({ type: 'session', state: 'start', channel: 'dashboard', alias: 'Steve' });
  });

  // Settings grew additive fields (model/voices/sensitivity/persona) plus a
  // read-only computed `thresholds` field on GET — updated to the new full shape.
  it('GET /api/settings returns sensible defaults', async () => {
    const res = await request(baseUrl).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      protectedName: 'Rose',
      notifyOn: 'takeover',
      contacts: [],
      model: '',
      voices: { grandma: '', guardian: '' },
      sensitivity: 'balanced',
      persona: { name: 'Rose', age: 78, city: 'Ottawa', grandkid: 'Tyler', quirks: 'gardening, a cat named Muffin, an old flip phone' },
      thresholds: { coach: 45, takeover: 80 },
    });
  });

  // A legacy (old-shape) PUT payload omits the additive fields — updated to
  // assert they default rather than expecting the payload to round-trip
  // byte-for-byte, proving backward compatibility for pre-existing clients.
  it('PUT /api/settings round-trips through GET, defaulting the additive fields for a legacy payload', async () => {
    const payload = {
      protectedName: 'Grandma Rose',
      notifyOn: 'coach',
      contacts: [{ id: 'c1', name: 'Sarah', channel: 'telegram', address: '12345' }],
    };
    const defaults = {
      model: '',
      voices: { grandma: '', guardian: '' },
      sensitivity: 'balanced',
      persona: { name: 'Rose', age: 78, city: 'Ottawa', grandkid: 'Tyler', quirks: 'gardening, a cat named Muffin, an old flip phone' },
    };
    const put = await request(baseUrl).put('/api/settings').send(payload);
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ...payload, ...defaults });

    const get = await request(baseUrl).get('/api/settings');
    expect(get.body).toEqual({ ...payload, ...defaults, thresholds: { coach: 45, takeover: 80 } });
  });

  it('PUT /api/settings 400s on an invalid channel', async () => {
    const res = await request(baseUrl)
      .put('/api/settings')
      .send({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [{ name: 'Sarah', channel: 'sms', address: '1' }] });
    expect(res.status).toBe(400);
  });

  it('PUT /api/settings 400s on more than 5 contacts', async () => {
    const contacts = Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, channel: 'telegram', address: `${i}` }));
    const res = await request(baseUrl).put('/api/settings').send({ protectedName: 'Rose', notifyOn: 'takeover', contacts });
    expect(res.status).toBe(400);
  });

  it('PUT /api/settings 400s on an invalid notifyOn', async () => {
    const res = await request(baseUrl).put('/api/settings').send({ protectedName: 'Rose', notifyOn: 'always', contacts: [] });
    expect(res.status).toBe(400);
  });

  it('GET /api/telegram/status reports not-connected when TELEGRAM_BOT_TOKEN is unset', async () => {
    const res = await request(baseUrl).get('/api/telegram/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, botUsername: null, recentChats: [] });
  });

  it('POST /api/alert-test reports no deliveries when no contacts are configured', async () => {
    const res = await request(baseUrl).post('/api/alert-test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deliveries: [] });
  });

  it('POST /api/alert-test reports a failed delivery for a configured telegram contact when no bot token is set', async () => {
    await request(baseUrl)
      .put('/api/settings')
      .send({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [{ name: 'Sarah', channel: 'telegram', address: '111' }] });
    const res = await request(baseUrl).post('/api/alert-test');
    expect(res.status).toBe(200);
    expect(res.body.deliveries).toEqual([
      { contact: 'Sarah', channel: 'telegram', ok: false, error: 'Telegram is not configured' },
    ]);
  });

  it('emits a delivery event and a real alert-summary intervention on takeover when a contact is configured', async () => {
    await request(baseUrl)
      .put('/api/settings')
      .send({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [{ name: 'Sarah', channel: 'telegram', address: '111' }] });

    const { events } = await connectSocket();
    const start = await request(baseUrl).post('/api/session/start').send({});
    const sessionId = start.body.sessionId as string;

    let ended = false;
    for (let i = 0; i < 6 && !ended; i += 1) {
      const res = await request(baseUrl).post('/api/turn').send({ sessionId, text: AGGRESSIVE_LINE });
      ended = res.body.ended === true;
    }
    expect(ended).toBe(true);

    const delivery = events.find((e) => e.type === 'delivery');
    expect(delivery).toMatchObject({ type: 'delivery', contact: 'Sarah', channel: 'telegram', ok: false });

    const alert = events.find((e) => e.type === 'intervention' && e.level === 'alert');
    expect(alert && 'text' in alert ? alert.text : undefined).toContain('Family alert attempted but delivery failed');
  });

  it('does not alert at the coach level by default (notifyOn: takeover)', async () => {
    const { events } = await connectSocket();
    const start = await request(baseUrl).post('/api/session/start').send({});
    const sessionId = start.body.sessionId as string;

    let ended = false;
    for (let i = 0; i < 6 && !ended; i += 1) {
      const res = await request(baseUrl).post('/api/turn').send({ sessionId, text: AGGRESSIVE_LINE });
      ended = res.body.ended === true;
    }
    expect(ended).toBe(true);

    const alertEvents = events.filter((e) => e.type === 'intervention' && e.level === 'alert');
    expect(alertEvents.length).toBe(1);
  });

  it('also alerts at the coach level when notifyOn is set to coach', async () => {
    await request(baseUrl).put('/api/settings').send({ protectedName: 'Rose', notifyOn: 'coach', contacts: [] });
    const { events } = await connectSocket();
    const start = await request(baseUrl).post('/api/session/start').send({});
    const sessionId = start.body.sessionId as string;

    let ended = false;
    for (let i = 0; i < 6 && !ended; i += 1) {
      const res = await request(baseUrl).post('/api/turn').send({ sessionId, text: AGGRESSIVE_LINE });
      ended = res.body.ended === true;
    }
    expect(ended).toBe(true);

    const alertEvents = events.filter((e) => e.type === 'intervention' && e.level === 'alert');
    expect(alertEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/models returns the curated list with the env primary active by default', async () => {
    const res = await request(baseUrl).get('/api/models');
    expect(res.status).toBe(200);
    expect(res.body.active).toBe('gemini-3-flash-preview');
    const ids = res.body.models.map((m: { id: string }) => m.id);
    expect(ids).toEqual(['gemini-3-flash-preview', 'gemini-flash-lite-latest', 'gemini-3-pro-preview']);
    expect(res.body.models[0]).toMatchObject({ id: 'gemini-3-flash-preview', source: 'primary' });
  });

  it('GET /api/models reports settings.model as the active/selected entry once set', async () => {
    await request(baseUrl)
      .put('/api/settings')
      .send({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [], model: 'gemini-3-pro-preview' });
    const res = await request(baseUrl).get('/api/models');
    expect(res.body.active).toBe('gemini-3-pro-preview');
    const selected = res.body.models.find((m: { id: string }) => m.id === 'gemini-3-pro-preview');
    expect(selected).toMatchObject({ source: 'selected' });
  });

  it('GET /api/voices returns an empty list when keyless', async () => {
    const res = await request(baseUrl).get('/api/voices');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ voices: [] });
  });

  it('GET /api/settings reports the balanced thresholds by default, and reflects a sensitivity change', async () => {
    const before = await request(baseUrl).get('/api/settings');
    expect(before.body.thresholds).toEqual({ coach: 45, takeover: 80 });

    await request(baseUrl).put('/api/settings').send({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [], sensitivity: 'paranoid' });
    const after = await request(baseUrl).get('/api/settings');
    expect(after.body.thresholds).toEqual({ coach: 35, takeover: 65 });
  });

  it('paranoid sensitivity coaches and takes over in fewer turns than the balanced default', async () => {
    await request(baseUrl)
      .put('/api/settings')
      .send({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [], sensitivity: 'paranoid' });
    const start = await request(baseUrl).post('/api/session/start').send({});
    const sessionId = start.body.sessionId as string;

    let ended = false;
    let turns = 0;
    for (let i = 0; i < 6 && !ended; i += 1) {
      const res = await request(baseUrl).post('/api/turn').send({ sessionId, text: AGGRESSIVE_LINE });
      ended = res.body.ended === true;
      turns += 1;
    }
    expect(ended).toBe(true);
    // The default 'balanced' escalation (see the coach-then-takeover test above) needs 4 turns
    // under this same AGGRESSIVE_LINE; paranoid's lower thresholds must reach takeover sooner.
    expect(turns).toBeLessThan(4);
  });

  it('relaxed sensitivity takes more turns to reach takeover than the balanced default', async () => {
    await request(baseUrl)
      .put('/api/settings')
      .send({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [], sensitivity: 'relaxed' });
    const start = await request(baseUrl).post('/api/session/start').send({});
    const sessionId = start.body.sessionId as string;

    let ended = false;
    let turns = 0;
    for (let i = 0; i < 8 && !ended; i += 1) {
      const res = await request(baseUrl).post('/api/turn').send({ sessionId, text: AGGRESSIVE_LINE });
      ended = res.body.ended === true;
      turns += 1;
    }
    expect(ended).toBe(true);
    expect(turns).toBeGreaterThan(4);
  });

  it('GET /api/session/:id/events replays broadcast events for a session in ts order', async () => {
    const start = await request(baseUrl).post('/api/session/start').send({ alias: 'Replay Test' });
    const sessionId = start.body.sessionId as string;
    await request(baseUrl).post('/api/turn').send({ sessionId, text: INNOCENT_LINE });
    await request(baseUrl).post(`/api/session/${sessionId}/end`);

    const res = await request(baseUrl).get(`/api/session/${sessionId}/events`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
    const timestamps = res.body.events.map((e: { ts: number }) => e.ts);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(res.body.events.some((e: { type: string }) => e.type === 'session')).toBe(true);
  });

  it('GET /api/session/:id/events returns an empty list for an unknown session', async () => {
    const res = await request(baseUrl).get('/api/session/does-not-exist/events');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ events: [] });
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

  it('GET /api/analytics aggregates a caught session', async () => {
    const start = await request(baseUrl).post('/api/session/start').send({});
    const sessionId = start.body.sessionId as string;

    let ended = false;
    for (let i = 0; i < 6 && !ended; i += 1) {
      const res = await request(baseUrl).post('/api/turn').send({ sessionId, text: AGGRESSIVE_LINE });
      ended = res.body.ended === true;
    }
    expect(ended).toBe(true);

    const res = await request(baseUrl).get('/api/analytics');
    expect(res.status).toBe(200);
    expect(res.body.totalCalls).toBe(1);
    expect(res.body.caught).toBe(1);
    expect(res.body.gaveUp).toBe(0);
    expect(res.body.catchRate).toBe(1);
    expect(res.body.avgMaxRisk).toBeGreaterThan(0);
    expect(res.body.tacticFrequency.length).toBeGreaterThan(0);
  });
});

describe('server integration with ElevenLabs enabled', () => {
  let built: BuiltApp;
  let baseUrl: string;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    built = buildApp();
    await new Promise<void>((resolve) => built.server.listen(0, resolve));
    const port = (built.server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    delete process.env.ELEVENLABS_API_KEY;
    global.fetch = originalFetch;
    resetVoicesCache();
    await new Promise<void>((resolve) => built.server.close(() => resolve()));
  });

  it('streams back audio/mpeg on a successful ElevenLabs call', async () => {
    global.fetch = (async () =>
      ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode('audio-bytes').buffer,
      }) as unknown as Response) as typeof fetch;

    const res = await request(baseUrl).post('/api/tts').send({ text: 'hello there', role: 'grandma' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
  });

  it('falls back to 503 {fallback:true} when the ElevenLabs call fails', async () => {
    global.fetch = (async () =>
      ({
        ok: false,
        status: 500,
        text: async () => 'boom',
      }) as unknown as Response) as typeof fetch;

    const res = await request(baseUrl).post('/api/tts').send({ text: 'hello there', role: 'guardian' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ fallback: true });
  });

  it('GET /api/voices proxies and caches the ElevenLabs voice list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        voices: [
          { voice_id: 'v1', name: 'Rachel' },
          { voice_id: 'v2', name: 'Antoni' },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = await request(baseUrl).get('/api/voices');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      voices: [
        { id: 'v1', name: 'Rachel' },
        { id: 'v2', name: 'Antoni' },
      ],
    });

    const second = await request(baseUrl).get('/api/voices');
    expect(second.body).toEqual(first.body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('POST /api/tts 400s on a voiceId that is not in the cached voice list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ voices: [{ voice_id: 'v1', name: 'Rachel' }] }),
    }) as unknown as typeof fetch;

    const res = await request(baseUrl).post('/api/tts').send({ text: 'hi', role: 'grandma', voiceId: 'not-real' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not-real');
  });

  it('POST /api/tts 400s on a non-string/empty voiceId', async () => {
    const res = await request(baseUrl).post('/api/tts').send({ text: 'hi', role: 'grandma', voiceId: '' });
    expect(res.status).toBe(400);
  });

  it('POST /api/tts uses a valid voiceId from the cache instead of the role default', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ ok: true, json: async () => ({ voices: [{ voice_id: 'v1', name: 'Rachel' }] }) })) // GET /v1/voices
      .mockImplementationOnce(async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('audio-bytes').buffer })); // TTS call
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(baseUrl).post('/api/tts').send({ text: 'hi', role: 'grandma', voiceId: 'v1' });
    expect(res.status).toBe(200);
    const ttsUrl = fetchMock.mock.calls[1][0] as string;
    expect(ttsUrl).toContain('v1');
  });

  it('POST /api/tts falls back to settings.voices override when no explicit voiceId is given', async () => {
    await request(baseUrl)
      .put('/api/settings')
      .send({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [], voices: { grandma: 'custom-grandma-voice', guardian: '' } });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('audio-bytes').buffer,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(baseUrl).post('/api/tts').send({ text: 'hi', role: 'grandma' });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toContain('custom-grandma-voice');
  });
});

describe('server integration with a failing store', () => {
  let built: BuiltApp;
  let baseUrl: string;

  const failingStore = {
    saveSessionStart: () => {
      throw new Error('store down');
    },
    saveSessionEnd: () => {
      throw new Error('store down');
    },
    saveEvent: () => {
      throw new Error('store down');
    },
    getLeaderboard: async () => {
      throw new Error('store down');
    },
  };

  beforeEach(async () => {
    built = buildApp({ store: failingStore });
    await new Promise<void>((resolve) => built.server.listen(0, resolve));
    const port = (built.server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => built.server.close(() => resolve()));
  });

  it('still starts and progresses a session when persistence throws on every call', async () => {
    const start = await request(baseUrl).post('/api/session/start').send({});
    expect(start.status).toBe(200);
    const sessionId = start.body.sessionId as string;

    const turn = await request(baseUrl).post('/api/turn').send({ sessionId, text: INNOCENT_LINE });
    expect(turn.status).toBe(200);

    const end = await request(baseUrl).post(`/api/session/${sessionId}/end`);
    expect(end.status).toBe(200);
  });

  it('returns an empty leaderboard instead of failing when the store rejects', async () => {
    const res = await request(baseUrl).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries: [] });
  });
});

describe('server integration with Telegram enabled', () => {
  let built: BuiltApp;
  const originalFetch = global.fetch;

  afterEach(async () => {
    built.telegram.stop();
    await new Promise<void>((resolve) => built.server.close(() => resolve()));
    vi.useRealTimers();
    global.fetch = originalFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.restoreAllMocks();
  });

  it('finds-or-creates a session per chat id, ignores /start, and mirrors the conversation as channel:telegram', async () => {
    vi.useFakeTimers();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';

    let telegramRef: BuiltApp['telegram'] | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ok: true, result: { username: 'RoseBot' } }) })) // getMe
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          result: [{ update_id: 1, message: { chat: { id: 555, type: 'private', first_name: 'Sarah' }, text: '/start' } }],
        }),
      })) // getUpdates: /start
      .mockImplementationOnce(async () => ({ ok: true })) // sendMessage: welcome reply
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          result: [{ update_id: 2, message: { chat: { id: 555, type: 'private', first_name: 'Sarah' }, text: INNOCENT_LINE } }],
        }),
      })) // getUpdates: a real (innocent) message
      .mockImplementationOnce(async () => ({ ok: true })) // sendMessage: grandma reply
      .mockImplementationOnce(async () => {
        telegramRef?.stop();
        return { ok: true, json: async () => ({ ok: true, result: [] }) };
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    // The Telegram poll loop here is driven purely by mocked, instantly-resolving
    // fetches, so it can drain entirely via microtasks before a real WebSocket
    // handshake (a macrotask) would ever get a turn. Capture broadcast events
    // through the store's saveEvent hook instead — buildApp() calls it for every
    // broadcast regardless of whether any WS client is connected, so it's race-free.
    const events: Event[] = [];
    const baseStore = createInMemoryStore();
    const capturingStore: Store = {
      ...baseStore,
      saveEvent(sessionId, event) {
        events.push(event);
        baseStore.saveEvent(sessionId, event);
      },
    };

    built = buildApp({ store: capturingStore });
    telegramRef = built.telegram;
    await new Promise<void>((resolve) => built.server.listen(0, resolve));
    const port = (built.server.address() as AddressInfo).port;

    for (let i = 0; i < 15; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await vi.advanceTimersByTimeAsync(0);
    }

    // /start never creates a session — only the first real message does.
    expect(built.sessions.size).toBe(1);
    const [session] = [...built.sessions.values()];
    expect(session.alias).toBe('Sarah');

    const welcomeCall = fetchMock.mock.calls[2];
    expect(JSON.parse((welcomeCall[1] as RequestInit).body as string).text).toContain('Hello dear');

    const replyCall = fetchMock.mock.calls[4];
    const replyBody = JSON.parse((replyCall[1] as RequestInit).body as string);
    expect(replyBody.chat_id).toBe('555');
    expect(typeof replyBody.text).toBe('string');

    const sessionStart = events.find((e) => e.type === 'session' && e.state === 'start');
    expect(sessionStart).toMatchObject({ type: 'session', state: 'start', channel: 'telegram', alias: 'Sarah' });
    expect(events.some((e) => e.type === 'utterance' && e.role === 'scammer' && e.text === INNOCENT_LINE)).toBe(true);
    expect(events.some((e) => e.type === 'utterance' && e.role === 'grandma')).toBe(true);

    const statusRes = await request(`http://localhost:${port}`).get('/api/telegram/status');
    expect(statusRes.body).toEqual({
      enabled: true,
      botUsername: 'RoseBot',
      recentChats: [{ chatId: '555', name: 'Sarah', lastSeen: expect.any(Number) }],
    });
  });

  it('starts a fresh session for the next message after a takeover ends the previous one', async () => {
    vi.useFakeTimers();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';

    let telegramRef: BuiltApp['telegram'] | undefined;
    const scamUpdate = (updateId: number) => ({
      ok: true,
      json: async () => ({
        ok: true,
        result: [{ update_id: updateId, message: { chat: { id: 777, type: 'private', first_name: 'Tom' }, text: AGGRESSIVE_LINE } }],
      }),
    });

    const fetchMock = vi.fn();
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ok: true, result: {} }) })); // getMe
    // Feed enough aggressive turns to guarantee a takeover, each followed by a sendMessage call.
    for (let i = 0; i < 6; i += 1) {
      fetchMock.mockImplementationOnce(async () => scamUpdate(i + 1));
      fetchMock.mockImplementationOnce(async () => ({ ok: true }));
    }
    fetchMock.mockImplementationOnce(async () => scamUpdate(100)); // message after takeover: should start a fresh session
    fetchMock.mockImplementationOnce(async () => ({ ok: true }));
    fetchMock.mockImplementationOnce(async () => {
      telegramRef?.stop();
      return { ok: true, json: async () => ({ ok: true, result: [] }) };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    built = buildApp();
    telegramRef = built.telegram;
    await new Promise<void>((resolve) => built.server.listen(0, resolve));

    for (let i = 0; i < 60; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await vi.advanceTimersByTimeAsync(0);
    }

    const allSessions = [...built.sessions.values()];
    expect(allSessions.length).toBeGreaterThanOrEqual(2);
    expect(allSessions.some((s) => s.ended && s.outcome === 'caught')).toBe(true);
    expect(allSessions.some((s) => !s.ended)).toBe(true);
  });
});

describe('server integration with Gemini enabled', () => {
  let built: BuiltApp;
  let baseUrl: string;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    built = buildApp();
    await new Promise<void>((resolve) => built.server.listen(0, resolve));
    const port = (built.server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    delete process.env.GEMINI_API_KEY;
    global.fetch = originalFetch;
    await new Promise<void>((resolve) => built.server.close(() => resolve()));
  });

  function mockGeminiFetch(text = '{"detections":[]}') {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('tries settings.model first, before the env primary/fallback chain', async () => {
    await request(baseUrl)
      .put('/api/settings')
      .send({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [], model: 'gemini-3-pro-preview' });

    const fetchMock = mockGeminiFetch();
    const start = await request(baseUrl).post('/api/session/start').send({});
    await request(baseUrl).post('/api/turn').send({ sessionId: start.body.sessionId, text: 'hello there' });

    expect(fetchMock).toHaveBeenCalled();
    const firstUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstUrl).toContain('models/gemini-3-pro-preview:generateContent');
  });

  it('builds the grandma system prompt from settings.persona for every gemini() call', async () => {
    await request(baseUrl)
      .put('/api/settings')
      .send({
        protectedName: 'Rose',
        notifyOn: 'takeover',
        contacts: [],
        persona: { name: 'Gigi', age: 82, city: 'Halifax', grandkid: 'Max', quirks: 'baking bread' },
      });

    const fetchMock = mockGeminiFetch();
    const start = await request(baseUrl).post('/api/session/start').send({});
    await request(baseUrl).post('/api/turn').send({ sessionId: start.body.sessionId, text: 'innocuous chat about the weather' });

    // Call 0 is the analyst (JSON schema); call 1 is the grandma reply — capture its systemInstruction.
    const grandmaCall = fetchMock.mock.calls[1];
    const body = JSON.parse((grandmaCall[1] as RequestInit).body as string) as { systemInstruction: { parts: { text: string }[] } };
    const system = body.systemInstruction.parts[0].text;
    expect(system).toContain('Gigi');
    expect(system).toContain('Halifax');
    expect(system).toContain('Max');
    expect(system).toContain('baking bread');
  });
});
