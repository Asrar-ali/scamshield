import { useCallback, useEffect, useRef, useState } from 'react';
import type { Event } from './types';
import { Header, type CallState } from './components/Header';
import { Landing } from './components/Landing';
import { Transcript, type Line, type Outcome } from './components/Transcript';
import { RiskGauge } from './components/RiskGauge';
import { TacticsPanel, type TacticHit } from './components/TacticsPanel';
import { InterventionsPanel, type Intervention } from './components/InterventionsPanel';
import { TakeoverFlash } from './components/TakeoverFlash';
import { FamilyAlertToast, type AlertToast } from './components/FamilyAlertToast';
import { Leaderboard } from './components/Leaderboard';
import { useElapsedTimer } from './hooks/useElapsedTimer';
import { useVoiceOutput } from './hooks/useVoiceOutput';
import { startSession, sendTurn, endSession } from './lib/api';

const MUTE_STORAGE_KEY = 'scamshield.muted';
const TOAST_LIFETIME_MS = 7000;

function readStoredMute(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [risk, setRisk] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [hits, setHits] = useState<TacticHit[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [input, setInput] = useState('');
  const [startBusy, setStartBusy] = useState(false);
  const [turnBusy, setTurnBusy] = useState(false);
  const [muted, setMuted] = useState(readStoredMute);
  const [takeoverTrigger, setTakeoverTrigger] = useState(0);
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);

  const toastIdRef = useRef(0);
  const voice = useVoiceOutput(muted);
  const elapsed = useElapsedTimer(startedAt, callState === 'live');

  const pushToast = useCallback((text: string) => {
    const id = (toastIdRef.current += 1);
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_LIFETIME_MS);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data as string) as Event;
      switch (event.type) {
        case 'utterance':
          setLines((prev) => [...prev, { role: event.role, text: event.text, ts: event.ts }]);
          if (event.role !== 'scammer') voice.enqueue(event.text, event.role);
          break;
        case 'tactic':
          setHits((prev) => [{ tactic: event.tactic, confidence: event.confidence, evidence: event.evidence, ts: event.ts }, ...prev]);
          break;
        case 'risk':
          setRisk(event.score);
          break;
        case 'intervention':
          setInterventions((prev) => [{ level: event.level, text: event.text, ts: event.ts }, ...prev]);
          if (event.level === 'takeover') {
            setOutcome('caught');
            setTakeoverTrigger((t) => t + 1);
          }
          if (event.level === 'alert') pushToast(event.text);
          break;
        case 'session':
          if (event.state === 'end') {
            setCallState('ended');
            setLeaderboardRefresh((r) => r + 1);
          }
          break;
        default:
          break;
      }
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToast]);

  const startCall = useCallback(async (alias: string) => {
    setStartBusy(true);
    setLines([]);
    setHits([]);
    setInterventions([]);
    setToasts([]);
    setOutcome(null);
    setRisk(0);
    setInput('');
    try {
      const data = await startSession(alias || 'Anonymous Scammer');
      setSessionId(data.sessionId);
      setStartedAt(Date.now());
      setCallState('live');
    } catch {
      setCallState('idle');
    } finally {
      setStartBusy(false);
    }
  }, []);

  const submitTurn = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!sessionId || !text || turnBusy || callState !== 'live') return;
      setTurnBusy(true);
      setInput('');
      try {
        const data = await sendTurn(sessionId, text);
        if (data.ended) setCallState('ended');
      } catch {
        // Server unreachable — leave the call live so the judge can retry.
      } finally {
        setTurnBusy(false);
      }
    },
    [sessionId, input, turnBusy, callState],
  );

  const giveUp = useCallback(async () => {
    if (!sessionId) return;
    setCallState('ended');
    setOutcome('gave_up');
    setLeaderboardRefresh((r) => r + 1);
    try {
      await endSession(sessionId);
    } catch {
      // Best-effort — the UI already reflects the judge's decision to bail.
    }
  }, [sessionId]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Storage may be unavailable (private mode) — mute still works for the session.
      }
      return next;
    });
  }, []);

  const inCall = callState !== 'idle';

  return (
    <div className={`app ${outcome === 'caught' ? 'app--caught' : ''}`}>
      <div className="app-bg" aria-hidden="true" />
      <TakeoverFlash trigger={takeoverTrigger} />
      <FamilyAlertToast toasts={toasts} onDismiss={dismissToast} />
      <Header connected={connected} callState={callState} elapsed={elapsed} muted={muted} onToggleMute={toggleMute} />

      {!inCall ? (
        <Landing busy={startBusy} onStart={startCall} />
      ) : (
        <main className="call-layout">
          <Transcript
            lines={lines}
            live={callState === 'live'}
            ended={callState === 'ended'}
            outcome={outcome}
            sessionActive={sessionId !== null}
            startBusy={startBusy}
            onStart={startCall}
            input={input}
            onInputChange={setInput}
            onSubmit={submitTurn}
            onGiveUp={giveUp}
            turnBusy={turnBusy}
            connected={connected}
            speaking={voice.isSpeaking}
            elapsed={elapsed}
          />

          <section className="side">
            <RiskGauge risk={risk} />
            <TacticsPanel hits={hits} />
            <InterventionsPanel interventions={interventions} />
            <Leaderboard refreshSignal={leaderboardRefresh} />
          </section>
        </main>
      )}
    </div>
  );
}
