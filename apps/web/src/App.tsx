import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Event } from './types';
import { Header, type AiStatus } from './components/Header';
import { RiskGauge } from './components/RiskGauge';
import { TacticsPanel, type TacticHit } from './components/TacticsPanel';
import { InterventionsPanel, type FeedItem } from './components/InterventionsPanel';
import { DeliveryToast, type DeliveryToastItem } from './components/DeliveryToast';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Leaderboard } from './components/Leaderboard';
import { Autopsy } from './components/Autopsy';
import { DiscordPanel } from './components/DiscordPanel';
import {
  buildAutopsyFromLive,
  buildAutopsyFromEvents,
  type AutopsyData,
  type RiskSample,
} from './lib/autopsy';
import { useLiveSocket } from './hooks/useLiveSocket';
import {
  fetchDiscordStatus,
  fetchSessionEvents,
  fetchSettings,
  type DiscordStatus,
  type Settings,
} from './lib/api';

const TOAST_LIFETIME_MS = 7000;
const DISCONNECTED_DISCORD: DiscordStatus = { enabled: false, botTag: null, guildName: null, monitoredUsers: [], recentUsers: [] };

export default function App() {
  // The currently-focused monitored user's session. The dashboard adopts the first
  // session it sees a 'start' event for, and tracks that user live until their
  // session ends (a flag). No alias form, no composer — the bot drives everything.
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [focusUser, setFocusUser] = useState<string | null>(null);
  const [risk, setRisk] = useState(0);
  const [hits, setHits] = useState<TacticHit[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus>(DISCONNECTED_DISCORD);
  const [deliveryToasts, setDeliveryToasts] = useState<DeliveryToastItem[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [riskSamples, setRiskSamples] = useState<RiskSample[]>([]);
  const [replay, setReplay] = useState<AutopsyData | null>(null);
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);

  const focusSessionRef = useRef<string | null>(null);
  const deliveryToastIdRef = useRef(0);

  useEffect(() => {
    focusSessionRef.current = focusSessionId;
  }, [focusSessionId]);

  // Fetch settings + Discord status once on mount. Both degrade to a benign
  // "not connected" shape on 404 / network failure — see lib/api.ts.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await fetchSettings();
      if (!cancelled) setSettings(s);
    })();
    void (async () => {
      const d = await fetchDiscordStatus();
      if (!cancelled) setDiscordStatus(d);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh Discord status (monitored users) each time the settings drawer opens.
  useEffect(() => {
    if (!settingsOpen) return;
    let cancelled = false;
    void (async () => {
      const d = await fetchDiscordStatus();
      if (!cancelled) setDiscordStatus(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);

  // Health-poll the AI status chip.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/health');
        if (!res.ok) return;
        const data = (await res.json()) as { ai?: AiStatus };
        if (!cancelled && data.ai) setAiStatus(data.ai);
      } catch {
        // Cosmetic — never surface.
      }
    };
    void poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const dismissDeliveryToast = useCallback((id: number) => {
    setDeliveryToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Apply one live event to console state. Passed to useLiveSocket, which owns the
  // socket lifecycle + reconnect; this stays a pure event→state reducer.
  const handleEvent = useCallback((event: Event) => {
    // Session scoping: the server stamps every per-session event with `sid`.
    // Ignore events from any session other than the one this console has adopted,
    // so a second monitored user can't interleave onto this screen.
    const sid = (event as { sid?: string }).sid;
    if (event.type !== 'session' && sid && sid !== focusSessionRef.current) return;
    switch (event.type) {
      case 'utterance':
        // Only scammer utterances matter here (there is no Rose reply). Guardian
        // utterances don't exist in monitoring mode.
        if (event.role === 'scammer') {
          // No transcript UI — utterances feed the risk/tactics panels implicitly.
        }
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
        break;
      case 'action':
        setFeed((prev) => [{ kind: 'action', action: event.action, userId: event.userId, detail: event.detail, ts: event.ts }, ...prev]);
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
          // Adopt the first session we see if nothing is in focus.
          if (focusSessionRef.current) break;
          focusSessionRef.current = event.id;
          setFocusSessionId(event.id);
          setFocusUser(event.alias ?? event.userId ?? 'Unknown user');
          setHits([]);
          setFeed([]);
          setRisk(0);
          setRiskSamples([]);
        } else if (event.state === 'end') {
          if (event.id !== focusSessionRef.current) break;
          setLeaderboardRefresh((r) => r + 1);
        }
        break;
      default:
        break;
    }
  }, []);

  const connState = useLiveSocket(handleEvent);

  const openReplay = useCallback(async (id: string, alias: string) => {
    const events = await fetchSessionEvents(id);
    const data = buildAutopsyFromEvents(events, alias || 'Unknown user');
    if (data) setReplay(data);
  }, []);

  // The forensic report for the focused user's session, once it ends.
  const liveAutopsy = useMemo<AutopsyData | null>(() => {
    if (!focusSessionId || riskSamples.length === 0) return null;
    return buildAutopsyFromLive({
      alias: focusUser ?? 'Unknown user',
      outcome: 'caught',
      startTs: riskSamples[0]?.ts ?? Date.now(),
      endTs: riskSamples[riskSamples.length - 1]?.ts ?? Date.now(),
      turns: hits.length,
      riskSamples,
      hits: hits.map((h) => ({ tactic: h.tactic, evidence: h.evidence, ts: h.ts })),
      interventions: [],
    });
  }, [focusSessionId, focusUser, riskSamples, hits]);

  const goHome = useCallback(() => {
    focusSessionRef.current = null;
    setFocusSessionId(null);
    setFocusUser(null);
    setRisk(0);
    setRiskSamples([]);
    setHits([]);
    setFeed([]);
    setReplay(null);
  }, []);

  return (
    <div className="app">
      <div className="app-bg" aria-hidden="true" />
      <DeliveryToast toasts={deliveryToasts} onDismiss={dismissDeliveryToast} />
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialSettings={settings}
        discordStatus={discordStatus}
      />
      <Header
        connState={connState}
        aiStatus={aiStatus}
        guildName={discordStatus.guildName}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {replay ? (
        <main className="call-layout">
          <div className="left-stack replay-stack">
            <div className="replay-bar">
              <button type="button" className="replay-back" onClick={() => setReplay(null)}>
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
                Back
              </button>
              <span className="replay-tag">Detection history</span>
            </div>
            <Autopsy data={replay} />
          </div>
          <section className="side">
            <Leaderboard refreshSignal={leaderboardRefresh} onReplay={openReplay} />
          </section>
        </main>
      ) : !focusSessionId ? (
        <main className="call-layout">
          <div className="left-stack">
            <div className="monitor-idle">
              <h2>ScamShield is monitoring</h2>
              <p className="empty">
                Waiting for the bot to observe messages in {discordStatus.guildName ?? 'your Discord server'}.
                When a member's risk crosses the flag threshold, their detection appears here live.
              </p>
              <DiscordPanel status={discordStatus} />
            </div>
          </div>
          <section className="side">
            <Leaderboard refreshSignal={leaderboardRefresh} onReplay={openReplay} />
          </section>
        </main>
      ) : (
        <main className="call-layout">
          <div className="left-stack">
            <div className="monitor-focus-head">
              <h2>{focusUser}</h2>
              {discordStatus.guildName && <span className="channel-chip channel-chip--telegram">in {discordStatus.guildName}</span>}
            </div>
            <RiskGauge
              risk={risk}
              samples={riskSamples}
              markers={hits.map((h) => ({ tactic: h.tactic, ts: h.ts }))}
              interventions={[]}
              startTs={riskSamples[0]?.ts ?? null}
              endTs={null}
            />
            <TacticsPanel hits={hits} />
            <InterventionsPanel items={feed} />
            {liveAutopsy && <Autopsy data={liveAutopsy} />}
          </div>

          <section className="side">
            <Leaderboard refreshSignal={leaderboardRefresh} onReplay={openReplay} />
          </section>
        </main>
      )}
    </div>
  );
}
