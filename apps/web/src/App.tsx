import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Event } from './types';
import type { AiStatus } from './components/Header';
import { GearIcon } from './components/icons';
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
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    let cancelled = false;
    void (async () => {
      const d = await fetchDiscordStatus();
      if (!cancelled) setDiscordStatus(d);
    })();
    return () => { cancelled = true; };
  }, [settingsOpen]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/health');
        if (!res.ok) return;
        const data = (await res.json()) as { ai?: AiStatus };
        if (!cancelled && data.ai) setAiStatus(data.ai);
      } catch { /* cosmetic */ }
    };
    void poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const dismissDeliveryToast = useCallback((id: number) => {
    setDeliveryToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleEvent = useCallback((event: Event) => {
    const sid = (event as { sid?: string }).sid;
    if (event.type !== 'session' && sid && sid !== focusSessionRef.current) return;
    switch (event.type) {
      case 'utterance':
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

  // suppress unused warning — settings is fetched and passed to drawer
  void settings;

  return (
    <div className="app">
      <DeliveryToast toasts={deliveryToasts} onDismiss={dismissDeliveryToast} />
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialSettings={settings}
        discordStatus={discordStatus}
      />

      {/* sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span className="sidebar-logo-text">scamshield</span>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-item${!replay ? ' is-active' : ''}`}
            onClick={goHome}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
            monitor
          </button>

          <button
            type="button"
            className={`sidebar-nav-item${replay ? ' is-active' : ''}`}
            onClick={() => { /* leaderboard visible in main content */ }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
            </svg>
            leaderboard
          </button>
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
            <div className={`conn conn-${connState}`}>
              <span className="conn-dot" />
              {connState === 'connected' ? 'connected' : connState}
            </div>
            {aiStatus && (
              <div className={`ai-chip ai-chip-${aiStatus}`}>
                {aiStatus === 'live' ? 'live ai' : aiStatus === 'degraded' ? 'degraded' : 'mock ai'}
              </div>
            )}
          </div>
          <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings">
            <GearIcon width={15} height={15} />
          </button>
        </div>
      </aside>

      {/* main content */}
      <div className="main-content">
        <div className="main-inner">
          {replay ? (
            <div>
              <button type="button" className="back-btn" onClick={() => setReplay(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
                </svg>
                back
              </button>
              <div className="page-eyebrow">detection history</div>
              <div className="left-stack">
                <Autopsy data={replay} />
                <div className="section-divider" />
                <div className="section-label">leaderboard</div>
                <Leaderboard refreshSignal={leaderboardRefresh} onReplay={openReplay} />
              </div>
            </div>
          ) : !focusSessionId ? (
            <div>
              <div className="page-eyebrow">monitor</div>
              <h1 className="page-title">dashboard</h1>
              <p className="page-sub">
                {discordStatus.guildName
                  ? `Monitoring ${discordStatus.guildName}. Waiting for the bot to observe messages.`
                  : 'Connect a Discord server to start monitoring.'}
              </p>
              <DiscordPanel status={discordStatus} />
              <div className="section-divider" style={{ marginTop: 40 }} />
              <div className="section-label">leaderboard</div>
              <Leaderboard refreshSignal={leaderboardRefresh} onReplay={openReplay} />
            </div>
          ) : (
            <div>
              <div className="page-eyebrow">monitoring</div>
              <div className="monitor-focus-head">
                <h2>{focusUser}</h2>
                {discordStatus.guildName && (
                  <span className="channel-chip channel-chip--telegram">in {discordStatus.guildName}</span>
                )}
              </div>
              <div className="left-stack" style={{ marginTop: 24 }}>
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
                <div className="section-divider" />
                <div className="section-label">leaderboard</div>
                <Leaderboard refreshSignal={leaderboardRefresh} onReplay={openReplay} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
