import { useCallback, useEffect, useRef, useState } from 'react';
import type { Event, TacticId } from './types';
import { TACTIC_LABELS } from './types';

interface TacticHit {
  tactic: TacticId;
  confidence: number;
  evidence: string;
  ts: number;
}

interface Line {
  role: 'scammer' | 'grandma' | 'guardian';
  text: string;
  ts: number;
}

interface Intervention {
  level: 'coach' | 'takeover' | 'alert';
  text: string;
  ts: number;
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [risk, setRisk] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [hits, setHits] = useState<TacticHit[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as Event;
      if (event.type === 'utterance') setLines((prev) => [...prev, { role: event.role, text: event.text, ts: event.ts }]);
      if (event.type === 'tactic') setHits((prev) => [{ tactic: event.tactic, confidence: event.confidence, evidence: event.evidence, ts: event.ts }, ...prev]);
      if (event.type === 'risk') setRisk(event.score);
      if (event.type === 'intervention') setInterventions((prev) => [{ level: event.level, text: event.text, ts: event.ts }, ...prev]);
      if (event.type === 'session' && event.state === 'end') setEnded(true);
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  const startSession = useCallback(async () => {
    setLines([]);
    setHits([]);
    setInterventions([]);
    setRisk(0);
    setEnded(false);
    const res = await fetch('/api/session/start', { method: 'POST' });
    const data = (await res.json()) as { sessionId: string };
    setSessionId(data.sessionId);
  }, []);

  const sendTurn = useCallback(async () => {
    if (!sessionId || !input.trim() || busy || ended) return;
    setBusy(true);
    const text = input.trim();
    setInput('');
    try {
      await fetch('/api/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text }),
      });
    } finally {
      setBusy(false);
    }
  }, [sessionId, input, busy, ended]);

  const riskLevel = risk >= 80 ? 'critical' : risk >= 45 ? 'elevated' : 'low';
  const activeTactics = [...new Set(hits.map((h) => h.tactic))];

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="shield">🛡</span> ScamShield <em>Live</em>
        </div>
        <div className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'LIVE' : 'DISCONNECTED'}</div>
      </header>

      <main>
        <section className="panel transcript-panel">
          <h2>Call Transcript</h2>
          <div className="transcript" ref={transcriptRef}>
            {lines.length === 0 && <p className="empty">Start a session, then play the scammer. Try to trick Rose.</p>}
            {lines.map((l, i) => (
              <div key={i} className={`line ${l.role}`}>
                <span className="who">{l.role === 'scammer' ? 'YOU (scammer)' : l.role === 'grandma' ? 'ROSE' : 'GUARDIAN'}</span>
                <p>{l.text}</p>
              </div>
            ))}
          </div>
          <div className="composer">
            {!sessionId || ended ? (
              <button className="primary" onClick={startSession}>
                {ended ? 'Call terminated — start a new call' : 'Start the call'}
              </button>
            ) : (
              <>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendTurn()}
                  placeholder="Say something to Rose… (you are the scammer)"
                  disabled={busy}
                  autoFocus
                />
                <button className="primary" onClick={sendTurn} disabled={busy || !input.trim()}>
                  {busy ? '…' : 'Send'}
                </button>
              </>
            )}
          </div>
        </section>

        <section className="side">
          <div className={`panel risk risk-${riskLevel}`}>
            <h2>Scam Risk</h2>
            <div className="risk-score">{risk}</div>
            <div className="risk-bar">
              <div className="risk-fill" style={{ width: `${risk}%` }} />
            </div>
            <div className="risk-label">{riskLevel.toUpperCase()}</div>
          </div>

          <div className="panel">
            <h2>Manipulation Tactics Detected</h2>
            <div className="tactics">
              {activeTactics.length === 0 && <p className="empty">Nothing yet. Rose is safe… for now.</p>}
              {activeTactics.map((t) => {
                const latest = hits.find((h) => h.tactic === t)!;
                return (
                  <div key={t} className="tactic-card">
                    <div className="tactic-name">{TACTIC_LABELS[t]}</div>
                    <div className="tactic-evidence">“{latest.evidence}”</div>
                    <div className="tactic-conf">{Math.round(latest.confidence * 100)}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <h2>Guardian Interventions</h2>
            <div className="interventions">
              {interventions.length === 0 && <p className="empty">Guardian is watching silently.</p>}
              {interventions.map((iv, i) => (
                <div key={i} className={`intervention ${iv.level}`}>
                  <span className="level">{iv.level.toUpperCase()}</span>
                  <p>{iv.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
