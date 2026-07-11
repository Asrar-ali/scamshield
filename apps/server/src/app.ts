import express from 'express';
import cors from 'cors';
import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { Detection, Event } from './types.js';
import { TACTIC_BY_ID } from './tactics.js';
import { ANALYST_SYSTEM, GRANDMA_SYSTEM, GUARDIAN_COACH_SYSTEM, GUARDIAN_TAKEOVER_SYSTEM } from './prompts.js';
import { gemini, geminiEnabled } from './gemini.js';
import { mockAnalyze, mockCoach, mockGrandma, mockTakeover } from './mock.js';
import { applyDetections, canTakeover, shouldCoach } from './risk.js';
import { sanitizeAlias } from './alias.js';
import { createStore, type SessionRecord, type SessionOutcome, type Store } from './store.js';
import { ttsEnabled, synthesizeSpeech, type VoiceRole } from './tts.js';
import { log } from './log.js';

interface Session {
  id: string;
  alias: string;
  history: { role: 'user' | 'model'; text: string }[];
  risk: number;
  maxRisk: number;
  turn: number;
  coached: boolean;
  cappedTurns: number;
  ended: boolean;
  outcome: SessionOutcome;
  tactics: Set<string>;
}

function toRecord(session: Session, startedAtTs: number, endedAt: number | null): SessionRecord {
  return {
    id: session.id,
    alias: session.alias,
    startedAt: startedAtTs,
    endedAt,
    outcome: session.outcome,
    maxRisk: Math.round(session.maxRisk),
    turns: session.turn,
    tactics: [...session.tactics],
  };
}

export interface BuiltApp {
  app: express.Express;
  server: Server;
  wss: WebSocketServer;
  sessions: Map<string, Session>;
}

export interface BuildAppOptions {
  store?: Store;
}

export function buildApp(options: BuildAppOptions = {}): BuiltApp {
  const sessions = new Map<string, Session>();
  const store = options.store ?? createStore();
  const startedAt = new Map<string, number>();

  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcast(event: Event, sessionId?: string) {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
    try {
      store.saveEvent(sessionId, event);
    } catch (err) {
      log.warn('store.saveEvent threw:', err instanceof Error ? err.message : err);
    }
  }

  function persistEnd(session: Session) {
    try {
      store.saveSessionEnd(toRecord(session, startedAt.get(session.id) ?? Date.now(), Date.now()));
    } catch (err) {
      log.warn('store.saveSessionEnd threw:', err instanceof Error ? err.message : err);
    }
  }

  async function analyze(session: Session, text: string): Promise<Detection[]> {
    if (!geminiEnabled()) return mockAnalyze(text);
    try {
      const context = session.history
        .slice(-8)
        .map((h) => `${h.role === 'user' ? 'CALLER' : 'ROSE'}: ${h.text}`)
        .join('\n');
      const raw = await gemini(ANALYST_SYSTEM, [
        { role: 'user', text: `Conversation so far:\n${context}\n\nNew CALLER utterance to analyze:\n"${text}"` },
      ]);
      const parsed = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, '')) as { detections: Detection[] };
      return parsed.detections.filter((d) => TACTIC_BY_ID.has(d.tactic));
    } catch (err) {
      log.warn('Analyst fell back to mock:', err instanceof Error ? err.message : err);
      return mockAnalyze(text);
    }
  }

  async function grandmaReply(session: Session): Promise<string> {
    if (!geminiEnabled()) return mockGrandma(session.turn);
    try {
      return await gemini(GRANDMA_SYSTEM, session.history);
    } catch (err) {
      log.warn('Grandma fell back to mock:', err instanceof Error ? err.message : err);
      return mockGrandma(session.turn);
    }
  }

  async function guardianLine(session: Session, level: 'coach' | 'takeover'): Promise<string> {
    const tacticLabels = [...session.tactics].map((t) => TACTIC_BY_ID.get(t as never)?.label ?? t);
    if (!geminiEnabled()) return level === 'coach' ? mockCoach() : mockTakeover(tacticLabels);
    try {
      const system = level === 'coach' ? GUARDIAN_COACH_SYSTEM : GUARDIAN_TAKEOVER_SYSTEM;
      return await gemini(system, [{ role: 'user', text: `Detected tactics so far: ${tacticLabels.join(', ')}` }]);
    } catch (err) {
      log.warn('Guardian fell back to mock:', err instanceof Error ? err.message : err);
      return level === 'coach' ? mockCoach() : mockTakeover(tacticLabels);
    }
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, mode: geminiEnabled() ? 'gemini' : 'mock' });
  });

  app.post('/api/session/start', (req, res) => {
    const body = (req.body ?? {}) as { alias?: unknown };
    const alias = sanitizeAlias(body.alias);
    const session: Session = {
      id: randomUUID(),
      alias,
      history: [],
      risk: 0,
      maxRisk: 0,
      turn: 0,
      coached: false,
      cappedTurns: 0,
      ended: false,
      outcome: 'in_progress',
      tactics: new Set(),
    };
    sessions.set(session.id, session);
    const now = Date.now();
    startedAt.set(session.id, now);
    try {
      store.saveSessionStart(toRecord(session, now, null));
    } catch (err) {
      log.warn('store.saveSessionStart threw:', err instanceof Error ? err.message : err);
    }
    broadcast({ type: 'session', state: 'start', id: session.id, ts: Date.now() }, session.id);
    broadcast({ type: 'risk', score: 0, ts: Date.now() }, session.id);
    res.json({ sessionId: session.id, alias });
  });

  app.post('/api/session/:id/end', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: `unknown session ${req.params.id}` });
      return;
    }
    if (!session.ended) {
      session.ended = true;
      session.outcome = 'gave_up';
      persistEnd(session);
      broadcast({ type: 'session', state: 'end', id: session.id, ts: Date.now() }, session.id);
    }
    res.json({ ended: true });
  });

  app.post('/api/turn', async (req, res) => {
    const { sessionId, text } = req.body as { sessionId?: string; text?: string };
    if (!sessionId || !text?.trim()) {
      res.status(400).json({ error: 'sessionId and non-empty text are required' });
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: `unknown session ${sessionId}` });
      return;
    }
    if (session.ended) {
      res.status(409).json({ error: 'session has ended — guardian terminated the call' });
      return;
    }

    const utterance = text.trim();
    session.history.push({ role: 'user', text: utterance });
    broadcast({ type: 'utterance', role: 'scammer', text: utterance, ts: Date.now() }, session.id);

    const detections = await analyze(session, utterance);
    for (const d of detections) {
      session.tactics.add(d.tactic);
      broadcast({ type: 'tactic', tactic: d.tactic, confidence: d.confidence, evidence: d.evidence, ts: Date.now() }, session.id);
    }

    const update = applyDetections(session.risk, detections);
    session.risk = update.risk;
    session.maxRisk = Math.max(session.maxRisk, session.risk);
    if (update.wasCapped) session.cappedTurns += 1;
    broadcast({ type: 'risk', score: Math.round(session.risk), ts: Date.now() }, session.id);

    if (canTakeover(session.risk, session.coached, session.cappedTurns)) {
      const line = await guardianLine(session, 'takeover');
      session.ended = true;
      session.outcome = 'caught';
      broadcast({ type: 'intervention', level: 'takeover', text: line, ts: Date.now() }, session.id);
      broadcast({ type: 'utterance', role: 'guardian', text: line, ts: Date.now() }, session.id);
      broadcast({ type: 'intervention', level: 'alert', text: 'Family alert sent to emergency contact.', ts: Date.now() }, session.id);
      broadcast({ type: 'session', state: 'end', id: session.id, ts: Date.now() }, session.id);
      persistEnd(session);
      res.json({ ended: true, risk: session.risk });
      return;
    }

    if (shouldCoach(session.risk, session.coached)) {
      session.coached = true;
      const line = await guardianLine(session, 'coach');
      broadcast({ type: 'intervention', level: 'coach', text: line, ts: Date.now() }, session.id);
    }

    const reply = await grandmaReply(session);
    session.history.push({ role: 'model', text: reply });
    session.turn += 1;
    broadcast({ type: 'utterance', role: 'grandma', text: reply, ts: Date.now() }, session.id);

    res.json({ ended: false, risk: session.risk, reply });
  });

  app.post('/api/tts', async (req, res) => {
    const { text, role } = req.body as { text?: string; role?: string };
    if (!text?.trim() || (role !== 'grandma' && role !== 'guardian')) {
      res.status(400).json({ error: 'text and role (grandma|guardian) are required' });
      return;
    }
    if (!ttsEnabled()) {
      res.status(503).json({ fallback: true });
      return;
    }
    try {
      const audio = await synthesizeSpeech(text.trim(), role as VoiceRole);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(audio);
    } catch (err) {
      log.warn('TTS request failed, falling back:', err instanceof Error ? err.message : err);
      res.status(503).json({ fallback: true });
    }
  });

  app.get('/api/leaderboard', async (_req, res) => {
    try {
      const entries = await store.getLeaderboard(10);
      res.json({ entries });
    } catch (err) {
      log.warn('getLeaderboard threw:', err instanceof Error ? err.message : err);
      res.json({ entries: [] });
    }
  });

  return { app, server, wss, sessions };
}
