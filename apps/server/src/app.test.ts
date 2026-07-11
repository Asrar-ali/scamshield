import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { buildApp, type BuiltApp } from './app.js';
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
    built = buildApp();
    sockets = [];
    await new Promise<void>((resolve) => built.server.listen(0, resolve));
    const port = (built.server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    for (const ws of sockets) ws.terminate();
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
    expect(res.body).toEqual({ ok: true, mode: 'mock' });
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
