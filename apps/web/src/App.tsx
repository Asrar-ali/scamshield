import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Autopsy } from './components/Autopsy';
import {
  buildAutopsyFromLive,
  buildAutopsyFromEvents,
  type AutopsyData,
  type RiskSample,
  type InterventionMoment,
} from './lib/autopsy';
import { useElapsedTimer } from './hooks/useElapsedTimer';
import { useVoiceOutput } from './hooks/useVoiceOutput';
import { useLiveSocket } from './hooks/useLiveSocket';
import {
  startSession,
  sendTurn,
  endSession,
  fetchSettings,
  fetchTelegramStatus,
  fetchSessionEvents,
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
  // Bounded to the current session — the risk trace feeding the sparkline and
  // the Autopsy timeline. Reset on every new session.
  const [riskSamples, setRiskSamples] = useState<RiskSample[]>([]);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  // Replay: an Autopsy built from a past session's fetched events, shown in the
  // left column in place of the live/landing view until dismissed.
  const [replay, setReplay] = useState<AutopsyData | null>(null);

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

  // Stamp the end time once, when the call settles, so the Autopsy duration is
  // fixed rather than ticking with re-renders.
  useEffect(() => {
    if (callState === 'ended') setEndedAt((prev) => prev ?? Date.now());
  }, [callState]);

  // Coach/takeover moments for the timeline, pulled from the intervention feed.
  const interventionMoments = useMemo<InterventionMoment[]>(
    () =>
      feed
        .filter((f): f is Extract<FeedItem, { kind: 'intervention' }> => f.kind === 'intervention')
        .map((f) => ({ level: f.level, ts: f.ts }))
        .filter((m): m is InterventionMoment => m.level !== 'alert'),
    [feed],
  );

  // The forensic report for the current call. Built only once the call has
  // ended; outcome falls back to inference when the server ended the session
  // without the dashboard setting one explicitly.
  const liveAutopsy = useMemo<AutopsyData | null>(() => {
    if (callState !== 'ended' || !startedAt) return null;
    const resolvedOutcome: 'caught' | 'gave_up' =
      outcome === 'caught' || interventionMoments.some((i) => i.level === 'takeover')
        ? 'caught'
        : 'gave_up';
    return buildAutopsyFromLive({
      alias: sessionAlias ?? 'Anonymous Scammer',
      outcome: resolvedOutcome,
      startTs: startedAt,
      endTs: endedAt ?? Date.now(),
      turns: lines.filter((l) => l.role === 'scammer').length,
      riskSamples,
      hits: hits.map((h) => ({ tactic: h.tactic, evidence: h.evidence, ts: h.ts })),
      interventions: interventionMoments,
    });
  }, [callState, startedAt, endedAt, outcome, sessionAlias, lines, riskSamples, hits, interventionMoments]);

  const openReplay = useCallback(async (id: string, alias: string) => {
    const events = await fetchSessionEvents(id);
    const data = buildAutopsyFromEvents(events, alias || 'Anonymous Scammer');
    if (data) setReplay(data);
  }, []);

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

  // Apply one live event to dashboard state. Passed to useLiveSocket, which owns
  // the socket lifecycle + reconnect; this stays a pure event→state reducer so a
  // dropped/reconnected socket never needs special handling here.
  const handleEvent = useCallback((event: Event) => {
    // Session scoping: the server stamps every per-session event with `sid`.
    // Ignore events from any session other than the one this dashboard has
    // adopted, so a second concurrent caller (another Telegram chat, a second
    // tab) can't interleave its transcript/voice/tactics onto this screen.
    // 'session' events are exempt — they drive adoption and teardown.
    const sid = (event as { sid?: string }).sid;
    if (event.type !== 'session' && sid && sid !== sessionIdRef.current) return;
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
          setRiskSamples((prev) => [...prev, { score: event.score, ts: event.ts }]);
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
              setRiskSamples([]);
              setEndedAt(null);
              setReplay(null);
              setInput('');
              sessionIdRef.current = event.id; // adopt synchronously so subsequent events pass the filter
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
  }, [pushToast, voice]);

  const connState = useLiveSocket(handleEvent);

  const startCall = useCallback(async (alias: string) => {
    setStartBusy(true);
    setLines([]);
    setHits([]);
    setFeed([]);
    setToasts([]);
    setDeliveryToasts([]);
    setOutcome(null);
    setRisk(0);
    setRiskSamples([]);
    setEndedAt(null);
    setReplay(null);
    setInput('');
    setSessionChannel('dashboard');
    setSessionAlias(alias || 'Anonymous Scammer');
    try {
      const data = await startSession(alias || 'Anonymous Scammer');
      sessionIdRef.current = data.sessionId; // adopt synchronously so the event filter matches immediately
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

  // Return to the landing hero: detach the dashboard from any ended/replayed
  // session and reset transient state. (Only offered when a call isn't live.)
  const goHome = useCallback(() => {
    sessionIdRef.current = null;
    setSessionId(null);
    setCallState('idle');
    setReplay(null);
    setOutcome(null);
    setRisk(0);
    setRiskSamples([]);
    setLines([]);
    setHits([]);
    setFeed([]);
    setToasts([]);
    setDeliveryToasts([]);
    setStartedAt(null);
    setEndedAt(null);
    setSessionChannel(null);
    setSessionAlias(null);
    setInput('');
  }, []);

  const inCall = callState !== 'idle';
  const connected = connState === 'connected';

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
        connState={connState}
        callState={callState}
        elapsed={elapsed}
        muted={muted}
        aiStatus={aiStatus}
        onToggleMute={toggleMute}
        onOpenSettings={() => setSettingsOpen(true)}
        onHome={callState === 'live' ? undefined : goHome}
      />

      {replay ? (
        <main className="call-layout">
          <div className="left-stack replay-stack">
            <div className="replay-bar">
              <button type="button" className="replay-back" onClick={() => setReplay(null)}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
                Back
              </button>
              <span className="replay-tag">Replay</span>
            </div>
            <Autopsy data={replay} />
          </div>
          <section className="side">
            <Leaderboard refreshSignal={leaderboardRefresh} onReplay={openReplay} />
          </section>
        </main>
      ) : !inCall ? (
        <Landing
          busy={startBusy}
          onStart={startCall}
          telegramStatus={telegramStatus}
          onReplay={openReplay}
          refreshSignal={leaderboardRefresh}
        />
      ) : (
        <main className="call-layout">
          <div className={`left-stack ${callState === 'ended' ? 'left-stack--ended' : ''}`}>
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
            {callState === 'ended' && liveAutopsy && <Autopsy data={liveAutopsy} />}
          </div>

          <section className="side">
            <RiskGauge
              risk={risk}
              samples={riskSamples}
              markers={hits.map((h) => ({ tactic: h.tactic, ts: h.ts }))}
              interventions={interventionMoments}
              startTs={startedAt}
              endTs={callState === 'live' ? null : endedAt}
            />
            <TacticsPanel hits={hits} />
            <InterventionsPanel items={feed} />
            <Leaderboard refreshSignal={leaderboardRefresh} onReplay={openReplay} />
          </section>
        </main>
      )}
    </div>
  );
}
