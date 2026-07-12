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
import { ThreatIntel } from './components/ThreatIntel';
import {
  buildAutopsyFromLive,
  buildAutopsyFromEvents,
  type AutopsyData,
  type RiskSample,
} from './lib/autopsy';
import { useLiveSocket } from './hooks/useLiveSocket';
import {
  fetchAnalytics,
  fetchDiscordStatus,
  fetchSessionEvents,
  fetchSettings,
  type Analytics,
  type DiscordStatus,
  type Settings,
} from './lib/api';

type Screen = 'overview' | 'monitor' | 'alerts' | 'leaderboard' | 'servers';

interface EventLogItem {
  text: string;
  dotColor: string;
  ts: number;
  extra?: string;
}

const TOAST_LIFETIME_MS = 7000;
const DISCONNECTED_DISCORD: DiscordStatus = { enabled: false, botTag: null, guildName: null, monitoredUsers: [], recentUsers: [] };

export default function App() {
  const [screen, setScreen] = useState<Screen>('overview');
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
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [eventLog, setEventLog] = useState<EventLogItem[]>([]);

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
    void (async () => {
      const a = await fetchAnalytics();
      if (!cancelled) setAnalytics(a);
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
          setScreen('monitor');
        } else if (event.state === 'end') {
          if (event.id !== focusSessionRef.current) break;
          setLeaderboardRefresh((r) => r + 1);
          setAnalytics(null);
          void fetchAnalytics().then(setAnalytics);
        }
        break;
      default:
        break;
    }

    // Accumulate for the alerts screen
    setEventLog(prev => {
      let text = '';
      let dotColor = 'var(--muted-2)';
      let extra = '';
      if (event.type === 'action') {
        const e = event as { type: 'action'; action: string; userId?: string };
        text = `${e.action} — ${e.userId ?? 'user'}`;
        dotColor = e.action === 'deleted' || e.action === 'muted' ? 'var(--crit)' : 'var(--accent)';
      } else if (event.type === 'intervention') {
        const e = event as { type: 'intervention'; level: string; text: string };
        text = e.text.slice(0, 80);
        dotColor = e.level === 'flag' ? 'var(--crit)' : 'var(--warn)';
      } else if (event.type === 'delivery') {
        const e = event as { type: 'delivery'; contact: string; channel: string; ok: boolean };
        text = `alert → ${e.contact} (${e.channel})`;
        dotColor = e.ok ? 'var(--accent)' : 'var(--crit)';
        extra = e.ok ? 'delivered' : 'failed';
      } else if (event.type === 'tactic') {
        const e = event as { type: 'tactic'; tactic: string; confidence: number };
        text = `detected: ${e.tactic.replace(/_/g, ' ')} (${Math.round(e.confidence * 100)}%)`;
        dotColor = 'var(--warn)';
      } else {
        return prev;
      }
      if (!text) return prev;
      return [{ text, dotColor, ts: (event as { ts?: number }).ts ?? Date.now(), extra }, ...prev].slice(0, 100);
    });
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
          <button type="button" className={`sidebar-nav-item${screen === 'overview' ? ' is-active' : ''}`} onClick={() => setScreen('overview')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/>
              <rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
            </svg>
            overview
          </button>

          <button type="button" className={`sidebar-nav-item${screen === 'monitor' ? ' is-active' : ''}`} onClick={() => setScreen('monitor')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <span style={{ flex: 1 }}>monitor</span>
            {focusSessionId && <span className="sidebar-nav-badge" style={{ color: 'var(--accent)' }}>●</span>}
          </button>

          <button type="button" className={`sidebar-nav-item${screen === 'alerts' ? ' is-active' : ''}`} onClick={() => setScreen('alerts')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.268 21a2 2 0 0 0 3.464 0"/>
              <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>
            </svg>
            <span style={{ flex: 1 }}>alerts</span>
            {eventLog.length > 0 && <span className="sidebar-nav-badge">{Math.min(eventLog.length, 99)}</span>}
          </button>

          <button type="button" className={`sidebar-nav-item${screen === 'leaderboard' ? ' is-active' : ''}`} onClick={() => setScreen('leaderboard')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
              <path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>
            </svg>
            leaderboard
          </button>

          <button type="button" className={`sidebar-nav-item${screen === 'servers' ? ' is-active' : ''}`} onClick={() => setScreen('servers')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="8" x="2" y="2" rx="2"/>
              <rect width="20" height="8" x="2" y="14" rx="2"/>
              <line x1="6" x2="6.01" y1="6" y2="6"/>
              <line x1="6" x2="6.01" y1="18" y2="18"/>
            </svg>
            servers
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

          {/* OVERVIEW */}
          {screen === 'overview' && (
            <div>
              <div className="page-eyebrow">overview</div>
              <h1 className="page-title">dashboard</h1>
              <p className="page-sub">Real-time scam detection across your monitored Discord servers.</p>

              <div className="stats-grid">
                <div className="stat-cell">
                  <div className="stat-cell-label">monitored users</div>
                  <div className="stat-cell-value">{discordStatus.monitoredUsers.length}</div>
                </div>
                <div className="stat-cell">
                  <div className="stat-cell-label">total flagged</div>
                  <div className="stat-cell-value stat-cell-value--danger">{analytics?.caught ?? 0}</div>
                </div>
                <div className="stat-cell">
                  <div className="stat-cell-label">alerts sent</div>
                  <div className="stat-cell-value">{analytics?.totalAlertsSent ?? 0}</div>
                </div>
                <div className="stat-cell">
                  <div className="stat-cell-label">catch rate</div>
                  <div className="stat-cell-value stat-cell-value--accent">
                    {analytics ? `${Math.round(analytics.catchRate * 100)}%` : '—'}
                  </div>
                </div>
              </div>

              <div className="section-label">recent activity</div>
              {eventLog.length === 0 ? (
                <p className="empty" style={{ paddingTop: 12 }}>No activity yet — waiting for the bot to observe messages.</p>
              ) : (
                eventLog.slice(0, 8).map((item, i) => (
                  <div key={i} className="feed-row">
                    <span className="feed-dot" style={{ background: item.dotColor }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-2, #d4d4d4)' }}>{item.text}</span>
                    {item.extra && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-2)' }}>{item.extra}</span>}
                    <span className="feed-time">{new Date(item.ts).toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* MONITOR */}
          {screen === 'monitor' && (
            <div>
              <div className="page-eyebrow">monitor</div>
              {replay ? (
                <div>
                  <button type="button" className="back-btn" onClick={() => setReplay(null)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
                    </svg>
                    back
                  </button>
                  <div className="page-eyebrow">detection history</div>
                  <Autopsy data={replay} />
                </div>
              ) : !focusSessionId ? (
                <div>
                  <h1 className="page-title">live monitor</h1>
                  <p className="page-sub">
                    {discordStatus.guildName
                      ? `Monitoring ${discordStatus.guildName}. Waiting for messages.`
                      : 'Connect a Discord server to start monitoring.'}
                  </p>
                  <DiscordPanel status={discordStatus} />
                </div>
              ) : (
                <div>
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
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ALERTS */}
          {screen === 'alerts' && (
            <div>
              <div className="page-eyebrow">alerts</div>
              <h1 className="page-title">event feed</h1>
              <p className="page-sub">Chronological log of everything the classifier surfaced.</p>
              {eventLog.length === 0 ? (
                <p className="empty" style={{ paddingTop: 12 }}>No events yet.</p>
              ) : (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {eventLog.map((item, i) => (
                    <div key={i} className="feed-row">
                      <span className="feed-dot" style={{ background: item.dotColor }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-2, #d4d4d4)' }}>{item.text}</span>
                      {item.extra && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-2)', marginRight: 8 }}>{item.extra}</span>}
                      <span className="feed-time">{new Date(item.ts).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LEADERBOARD */}
          {screen === 'leaderboard' && (
            <div>
              <div className="page-eyebrow">leaderboard</div>
              <h1 className="page-title">flagged sessions</h1>
              <p className="page-sub">Every session caught by the classifier, ranked by turns survived.</p>
              <Leaderboard refreshSignal={leaderboardRefresh} onReplay={(id, alias) => { void openReplay(id, alias); setScreen('monitor'); }} />
              <div className="section-divider" style={{ marginTop: 40 }} />
              <div className="section-label">threat intel</div>
              <ThreatIntel refreshSignal={leaderboardRefresh} />
            </div>
          )}

          {/* SERVERS */}
          {screen === 'servers' && (
            <div>
              <div className="page-eyebrow">servers</div>
              <h1 className="page-title">monitored servers</h1>
              <p className="page-sub">
                {discordStatus.enabled
                  ? `Bot connected as ${discordStatus.botTag} · ${discordStatus.guildName ?? 'unknown server'}`
                  : 'No Discord bot connected. Set DISCORD_BOT_TOKEN to enable monitoring.'}
              </p>

              {discordStatus.enabled && (
                <div>
                  <div className="section-label" style={{ marginBottom: 16 }}>active users</div>
                  {discordStatus.monitoredUsers.length === 0 ? (
                    <p className="empty" style={{ paddingTop: 8 }}>No users monitored yet.</p>
                  ) : (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      <div className="table-header" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
                        <span>user</span><span>risk</span><span>messages</span><span>tactics</span><span>status</span>
                      </div>
                      {discordStatus.monitoredUsers.map(u => (
                        <div key={u.userId} className="table-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{u.name}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: u.risk >= 65 ? 'var(--crit)' : u.risk >= 35 ? 'var(--warn)' : 'var(--muted)' }}>{u.risk}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{u.turns}</span>
                          <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{u.tactics.slice(0, 2).join(', ') || '—'}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: u.blocked ? 'var(--crit)' : 'var(--accent)' }}>{u.blocked ? 'blocked' : 'watching'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="section-divider" style={{ marginTop: 32 }} />
                  <div className="section-label" style={{ marginBottom: 16 }}>sensitivity</div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                    Current: <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{settings?.sensitivity ?? 'balanced'}</span>
                    {' '}— flag threshold <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{settings?.thresholds?.flag ?? 50}</span>
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--muted-2)' }}>Change via Settings → Detection.</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
