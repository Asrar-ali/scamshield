import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { Detection, Event } from './types.js';
import { TACTIC_BY_ID } from './tactics.js';
import { ANALYST_SYSTEM, GRANDMA_SYSTEM, GUARDIAN_COACH_SYSTEM, GUARDIAN_TAKEOVER_SYSTEM } from './prompts.js';
import { gemini, geminiEnabled } from './gemini.js';
import { mockAnalyze, mockCoach, mockGrandma, mockTakeover } from './mock.js';
import { log } from './log.js';

const PORT = Number(process.env.PORT ?? 3001);
const COACH_THRESHOLD = 45;
const TAKEOVER_THRESHOLD = 80;
const RISK_DECAY_PER_CLEAN_TURN = 4;

interface Session {
  id: string;
  history: { role: 'user' | 'model'; text: string }[];
  risk: number;
  turn: number;
  coached: boolean;
  ended: boolean;
  tactics: Set<string>;
}

const sessions = new Map<string, Session>();

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(event: Event) {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
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

app.post('/api/session/start', (_req, res) => {
  const session: Session = {
    id: randomUUID(),
    history: [],
    risk: 0,
    turn: 0,
    coached: false,
    ended: false,
    tactics: new Set(),
  };
  sessions.set(session.id, session);
  broadcast({ type: 'session', state: 'start', id: session.id, ts: Date.now() });
  broadcast({ type: 'risk', score: 0, ts: Date.now() });
  res.json({ sessionId: session.id });
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
  broadcast({ type: 'utterance', role: 'scammer', text: utterance, ts: Date.now() });

  const detections = await analyze(session, utterance);
  for (const d of detections) {
    session.tactics.add(d.tactic);
    const weight = TACTIC_BY_ID.get(d.tactic)?.weight ?? 6;
    session.risk = Math.min(100, session.risk + weight * d.confidence);
    broadcast({ type: 'tactic', tactic: d.tactic, confidence: d.confidence, evidence: d.evidence, ts: Date.now() });
  }
  if (detections.length === 0) {
    session.risk = Math.max(0, session.risk - RISK_DECAY_PER_CLEAN_TURN);
  }
  broadcast({ type: 'risk', score: Math.round(session.risk), ts: Date.now() });

  if (session.risk >= TAKEOVER_THRESHOLD) {
    const line = await guardianLine(session, 'takeover');
    session.ended = true;
    broadcast({ type: 'intervention', level: 'takeover', text: line, ts: Date.now() });
    broadcast({ type: 'utterance', role: 'guardian', text: line, ts: Date.now() });
    broadcast({ type: 'intervention', level: 'alert', text: 'Family alert sent to emergency contact.', ts: Date.now() });
    broadcast({ type: 'session', state: 'end', id: session.id, ts: Date.now() });
    res.json({ ended: true, risk: session.risk });
    return;
  }

  if (session.risk >= COACH_THRESHOLD && !session.coached) {
    session.coached = true;
    const line = await guardianLine(session, 'coach');
    broadcast({ type: 'intervention', level: 'coach', text: line, ts: Date.now() });
  }

  const reply = await grandmaReply(session);
  session.history.push({ role: 'model', text: reply });
  session.turn += 1;
  broadcast({ type: 'utterance', role: 'grandma', text: reply, ts: Date.now() });

  res.json({ ended: false, risk: session.risk, reply });
});

server.listen(PORT, () => {
  log.info(`ScamShield server on :${PORT} (mode: ${geminiEnabled() ? 'gemini' : 'mock'})`);
});
