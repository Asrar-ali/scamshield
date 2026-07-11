import { useCallback, useEffect, useRef, useState } from 'react';
import type { Event } from './types';
import { Header, type CallState, type AiStatus } from './components/Header';
import { Landing } from './components/Landing';
import { Transcript, type Line, type Outcome, type SessionChannel } from './components/Transcript';
import { RiskGauge } from './components/RiskGauge';
import { TacticsPanel, type TacticHit } from './components/TacticsPanel';
import { InterventionsPanel, type FeedItem } from './components/InterventionsPanel';
import { TakeoverFlash } from './components/TakeoverFlash';
import { FamilyAlertToast, type AlertToast } from './components/FamilyAlertToast';
import { DeliveryToast, type DeliveryToastItem } from './components/DeliveryToast';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Leaderboard } from './components/Leaderboard';
import { useElapsedTimer } from './hooks/useElapsedTimer';
import { useVoiceOutput } from './hooks/useVoiceOutput';
import {
  startSession,
  sendTurn,
  endSession,
  fetchSettings,
  fetchTelegramStatus,
  type Settings,
  type TelegramStatus,
} from './lib/api';

const MUTE_STORAGE_KEY = 'scamshield.muted';
const TOAST_LIFETIME_MS = 7000;
const DISCONNECTED_TELEGRAM: TelegramStatus = { enabled: false, botUsername: null, recentChats: [] };

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
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [input, setInput] = useState('');
  const [startBusy, setStartBusy] = useState(false);
  const [turnBusy, setTurnBusy] = useState(false);
  const [muted, setMuted] = useState(readStoredMute);
  const [takeoverTrigger, setTakeoverTrigger] = useState(0);
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);
  const [sessionChannel, setSessionChannel] = useState<SessionChannel>(null);
  const [sessionAlias, setSessionAlias] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus>(DISCONNECTED_TELEGRAM);
  const [deliveryToasts, setDeliveryToasts] = useState<DeliveryToastItem[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  const toastIdRef = useRef(0);
  const deliveryToastIdRef = useRef(0);
  const callStateRef = useRef(callState);
  const sessionIdRef = useRef(sessionId);
  const voice = useVoiceOutput(muted);
  const elapsed = useElapsedTimer(startedAt, callState === 'live');

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/health');
        if (!res.ok) return;
        const data = (await res.json()) as { ai?: AiStatus };
        if (!cancelled && data.ai) setAiStatus(data.ai);
      } catch {
        // Health polling is cosmetic — never surface errors.
      }
    };
    void poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const pushToast = useCallback((text: string) => {
    const id = (toastIdRef.current += 1);
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_LIFETIME_MS);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissDeliveryToast = useCallback((id: number) => {
    setDeliveryToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch settings + Telegram status once on mount. Both degrade to a benign
  // "not connected" shape on 404 / network failure — see lib/api.ts.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await fetchSettings();
      if (!cancelled) setSettings(s);
    })();
    void (async () => {
      const t = await fetchTelegramStatus();
      if (!cancelled) setTelegramStatus(t);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh Telegram status (recent chats) each time the settings drawer opens.
  useEffect(() => {
    if (!settingsOpen) return;
    let cancelled = false;
    void (async () => {
      const t = await fetchTelegramStatus();
      if (!cancelled) setTelegramStatus(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);

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
          setFeed((prev) => [{ kind: 'intervention', level: event.level, text: event.text, ts: event.ts }, ...prev]);
          if (event.level === 'takeover') {
            setOutcome('caught');
            setTakeoverTrigger((t) => t + 1);
          }
          if (event.level === 'alert') pushToast(event.text);
          break;
        case 'delivery': {
          setFeed((prev) => [
            { kind: 'delivery', contact: event.contact, channel: event.channel, ok: event.ok, ts: event.ts },
            ...prev,
          ]);
          const id = (deliveryToastIdRef.current += 1);
          setDeliveryToasts([{ id, contact: event.contact, channel: event.channel, ok: event.ok }]);
          setTimeout(() => setDeliveryToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_LIFETIME_MS);
          break;
        }
        case 'session':
          if (event.state === 'start') {
            // A dashboard-originated start is already reflected locally by
            // startCall(); only adopt Telegram-originated sessions here, and
            // only when no other session currently owns the dashboard —
            // first active session wins until it ends.
            if (callStateRef.current === 'live') break;
            if (event.channel === 'telegram') {
              setLines([]);
              setHits([]);
              setFeed([]);
              setToasts([]);
              setDeliveryToasts([]);
              setOutcome(null);
              setRisk(0);
              setInput('');
              setSessionId(event.id);
              setSessionChannel('telegram');
              setSessionAlias(event.alias ?? 'Telegram caller');
              setStartedAt(Date.now());
              setCallState('live');
            }
          } else if (event.state === 'end') {
            if (event.id !== sessionIdRef.current) break;
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
    setFeed([]);
    setToasts([]);
    setDeliveryToasts([]);
    setOutcome(null);
    setRisk(0);
    setInput('');
    setSessionChannel('dashboard');
    setSessionAlias(alias || 'Anonymous Scammer');
    try {
      const data = await startSession(alias || 'Anonymous Scammer');
      setSessionId(data.sessionId);
      setStartedAt(Date.now());
      setCallState('live');
    } catch {
      setCallState('idle');
      setSessionChannel(null);
      setSessionAlias(null);
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
      <DeliveryToast toasts={deliveryToasts} onDismiss={dismissDeliveryToast} />
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialSettings={settings}
        telegramStatus={telegramStatus}
      />
      <Header
        connected={connected}
        callState={callState}
        elapsed={elapsed}
        muted={muted}
        aiStatus={aiStatus}
        onToggleMute={toggleMute}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {!inCall ? (
        <Landing busy={startBusy} onStart={startCall} telegramStatus={telegramStatus} />
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
            sessionChannel={sessionChannel}
            sessionAlias={sessionAlias}
          />

          <section className="side">
            <RiskGauge risk={risk} />
            <TacticsPanel hits={hits} />
            <InterventionsPanel items={feed} />
            <Leaderboard refreshSignal={leaderboardRefresh} />
          </section>
        </main>
      )}
    </div>
  );
}
