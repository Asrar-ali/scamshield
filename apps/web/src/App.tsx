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
  fetchAnalytics,
  fetchDiscordStatus,
  fetchSessionEvents,
  fetchSettings,
  type Analytics,
  type DiscordStatus,
  type Settings,
} from './lib/api';

type Screen = 'dashboard' | 'monitor' | 'leaderboard' | 'servers';

interface AlertTactic {
  tactic: string;
  confidence: number;
  evidence: string;
}

interface EventLogItem {
  id: number;
  text: string;
  dotColor: string;
  ts: number;
  extra?: string;
  // Rich detail fields (only on action events)
  userId?: string;
  alias?: string;
  action?: string;
  risk?: number;
  tactics?: AlertTactic[];
  messageText?: string;
}

interface PendingAlert {
  tactics: AlertTactic[];
  risk: number;
  userId?: string;
  alias?: string;
  messageText?: string;
}

const TOAST_LIFETIME_MS = 7000;
const DISCONNECTED_DISCORD: DiscordStatus = { enabled: false, botTag: null, guildName: null, monitoredUsers: [], recentUsers: [] };

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
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

  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);

  const focusSessionRef = useRef<string | null>(null);
  const deliveryToastIdRef = useRef(0);
  const eventLogIdRef = useRef(0);
  const pendingAlertRef = useRef<PendingAlert>({ tactics: [], risk: 0 });

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
    let cancelled = false;
    void (async () => {
      const [d, s] = await Promise.all([fetchDiscordStatus(), fetchSettings()]);
      if (!cancelled) { setDiscordStatus(d); setSettings(s); }
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
        if (event.role === 'scammer') {
          pendingAlertRef.current.messageText = event.text;
          if (event.userId) pendingAlertRef.current.userId = event.userId;
        }
        break;
      case 'tactic':
        setHits((prev) => [{ tactic: event.tactic, confidence: event.confidence, evidence: event.evidence, ts: event.ts }, ...prev]);
        pendingAlertRef.current.tactics.push({ tactic: event.tactic, confidence: event.confidence, evidence: event.evidence });
        break;
      case 'risk':
        setRisk(event.score);
        setRiskSamples((prev) => [...prev, { score: event.score, ts: event.ts }]);
        pendingAlertRef.current.risk = event.score;
        if (event.userId && !pendingAlertRef.current.userId) pendingAlertRef.current.userId = event.userId;
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
          pendingAlertRef.current = { tactics: [], risk: 0, alias: event.alias, userId: event.userId };
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
      const ts = (event as { ts?: number }).ts ?? Date.now();
      const id = (eventLogIdRef.current += 1);

      if (event.type === 'action') {
        const e = event as { type: 'action'; action: string; userId?: string };
        const isCritical = e.action === 'deleted' || e.action === 'muted';
        const dotColor = isCritical ? 'var(--crit)' : 'var(--accent)';
        const text = `${e.action} — ${e.userId ?? 'user'}`;

        // Snapshot pending data when the first critical action fires (deleted/muted)
        const pending = pendingAlertRef.current;
        const resolvedAlias = pending.alias ?? pending.userId;
        const item: EventLogItem = {
          id,
          text: isCritical ? `${e.action} — ${resolvedAlias ?? e.userId ?? 'user'}` : text,
          dotColor,
          ts,
          action: e.action,
          userId: e.userId ?? pending.userId,
          alias: pending.alias,
          risk: pending.risk,
          tactics: isCritical && pending.tactics.length > 0 ? [...pending.tactics] : undefined,
          messageText: isCritical ? pending.messageText : undefined,
        };
        // After snapshotting, clear tactics/message so subsequent actions (warned/reported) don't re-show them
        if (isCritical) pendingAlertRef.current = { tactics: [], risk: pending.risk, userId: pending.userId, alias: pending.alias };
        return [item, ...prev].slice(0, 100);
      }

      if (event.type === 'intervention') {
        const e = event as { type: 'intervention'; level: string; text: string };
        return [{ id, text: e.text.slice(0, 100), dotColor: e.level === 'flag' ? 'var(--crit)' : 'var(--warn)', ts }, ...prev].slice(0, 100);
      }

      if (event.type === 'delivery') {
        const e = event as { type: 'delivery'; contact: string; channel: string; ok: boolean };
        return [{
          id,
          text: `alert → ${e.contact} (${e.channel})`,
          dotColor: e.ok ? 'var(--accent)' : 'var(--crit)',
          ts,
          extra: e.ok ? 'delivered' : 'failed',
        }, ...prev].slice(0, 100);
      }

      if (event.type === 'tactic') {
        const e = event as { type: 'tactic'; tactic: string; confidence: number; evidence: string };
        return [{
          id,
          text: `detected: ${e.tactic.replace(/_/g, ' ')} (${Math.round(e.confidence * 100)}%)`,
          dotColor: 'var(--warn)',
          ts,
          messageText: e.evidence,
        }, ...prev].slice(0, 100);
      }

      return prev;
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
          <button type="button" className={`sidebar-nav-item${screen === 'dashboard' ? ' is-active' : ''}`} onClick={() => setScreen('dashboard')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/>
              <rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
            </svg>
            <span style={{ flex: 1 }}>dashboard</span>
            {eventLog.length > 0 && <span className="sidebar-nav-badge">{Math.min(eventLog.length, 99)}</span>}
          </button>

          <button type="button" className={`sidebar-nav-item${screen === 'monitor' ? ' is-active' : ''}`} onClick={() => setScreen('monitor')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <span style={{ flex: 1 }}>monitor</span>
            {focusSessionId && <span className="sidebar-nav-badge" style={{ color: 'var(--accent)' }}>●</span>}
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

          {/* DASHBOARD */}
          {screen === 'dashboard' && (
            <div>
              <div className="page-eyebrow">dashboard</div>
              <h1 className="page-title">overview</h1>
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

              <div className="section-label" style={{ marginTop: 32 }}>event feed</div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Click an action card to see user, message, and detected tactics.</p>
              {eventLog.length === 0 ? (
                <p className="empty" style={{ paddingTop: 8 }}>No events yet — waiting for the bot to detect activity.</p>
              ) : (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {eventLog.map((item) => {
                    const isExpandable = !!(item.tactics?.length || item.messageText);
                    const isOpen = selectedAlertId === item.id;
                    return (
                      <div key={item.id}>
                        <div
                          className="feed-row"
                          style={{ cursor: isExpandable ? 'pointer' : 'default' }}
                          onClick={() => isExpandable && setSelectedAlertId(isOpen ? null : item.id)}
                        >
                          <span className="feed-dot" style={{ background: item.dotColor }} />
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-2, #d4d4d4)' }}>{item.text}</span>
                          {item.extra && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-2)', marginRight: 8 }}>{item.extra}</span>}
                          {isExpandable && (
                            <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 8 }}>{isOpen ? '▲' : '▼'}</span>
                          )}
                          <span className="feed-time">{new Date(item.ts).toLocaleTimeString()}</span>
                        </div>

                        {isOpen && (
                          <div style={{
                            margin: '0 0 4px 24px',
                            padding: '12px 16px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            fontSize: 12,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                              <div style={{
                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                background: 'linear-gradient(135deg,#34d399,#10b981)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, fontWeight: 700, color: '#000',
                              }}>
                                {(item.alias ?? item.userId ?? '?')[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
                                  {item.alias ?? item.userId ?? 'Unknown user'}
                                </div>
                                {item.userId && item.alias && (
                                  <div style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>id: {item.userId}</div>
                                )}
                              </div>
                              {item.risk !== undefined && (
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>risk</div>
                                  <div style={{
                                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 20,
                                    color: item.risk >= 65 ? 'var(--crit)' : item.risk >= 35 ? 'var(--warn)' : 'var(--accent)',
                                  }}>{Math.round(item.risk)}</div>
                                </div>
                              )}
                            </div>

                            {item.messageText && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>message</div>
                                <div style={{
                                  padding: '8px 10px',
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderLeft: '3px solid var(--crit)',
                                  borderRadius: 4,
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--fg-2)',
                                  lineHeight: 1.5,
                                  fontSize: 12,
                                }}>
                                  {item.messageText}
                                </div>
                              </div>
                            )}

                            {item.tactics && item.tactics.length > 0 && (
                              <div>
                                <div style={{ color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.08em' }}>detected tactics</div>
                                {item.tactics.map((t, ti) => (
                                  <div key={ti} style={{ marginBottom: ti < item.tactics!.length - 1 ? 8 : 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                      <span style={{
                                        padding: '2px 7px',
                                        background: 'rgba(239,68,68,0.12)',
                                        border: '1px solid rgba(239,68,68,0.3)',
                                        borderRadius: 3,
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        color: 'var(--crit)',
                                        letterSpacing: '0.02em',
                                      }}>
                                        {t.tactic.replace(/_/g, ' ')}
                                      </span>
                                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--warn)', fontSize: 11 }}>
                                        {Math.round(t.confidence * 100)}%
                                      </span>
                                    </div>
                                    {t.evidence && (
                                      <div style={{
                                        padding: '6px 10px',
                                        background: 'var(--bg)',
                                        border: '1px solid var(--border)',
                                        borderLeft: '3px solid var(--warn)',
                                        borderRadius: 4,
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--muted)',
                                        fontSize: 11,
                                        fontStyle: 'italic',
                                        lineHeight: 1.5,
                                      }}>
                                        "{t.evidence}"
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
              ) : (
                <div>
                  <h1 className="page-title">active sessions</h1>
                  <p className="page-sub">
                    {discordStatus.guildName
                      ? `Monitoring ${discordStatus.guildName} · ${discordStatus.monitoredUsers.length} user${discordStatus.monitoredUsers.length !== 1 ? 's' : ''} tracked`
                      : 'Connect a Discord server to start monitoring.'}
                  </p>

                  {/* User cards sorted by maxRisk desc */}
                  {discordStatus.monitoredUsers.length === 0 ? (
                    <div>
                      <p className="empty" style={{ paddingTop: 8 }}>No users tracked yet — the bot will appear here once it observes messages.</p>
                      <DiscordPanel status={discordStatus} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                      {[...discordStatus.monitoredUsers]
                        .sort((a, b) => b.maxRisk - a.maxRisk)
                        .map((u) => {
                          const isLive = focusUser === u.name || (focusSessionId && !u.blocked && discordStatus.monitoredUsers.length === 1);
                          const riskColor = u.maxRisk >= 65 ? 'var(--crit)' : u.maxRisk >= 35 ? 'var(--warn)' : 'var(--accent)';
                          return (
                            <div key={u.userId}>
                              <div
                                style={{
                                  border: `1px solid ${u.blocked ? 'rgba(239,68,68,0.4)' : isLive ? 'rgba(52,211,153,0.4)' : 'var(--border)'}`,
                                  borderRadius: 8,
                                  padding: '16px 20px',
                                  background: 'var(--surface)',
                                  cursor: isLive ? 'pointer' : 'default',
                                }}
                                onClick={() => isLive && setSelectedAlertId(selectedAlertId === -1 ? null : -1)}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                  <div style={{
                                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                    background: u.blocked ? 'rgba(239,68,68,0.2)' : 'linear-gradient(135deg,#34d399,#10b981)',
                                    border: `2px solid ${riskColor}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 14, fontWeight: 700, color: u.blocked ? 'var(--crit)' : '#000',
                                  }}>
                                    {u.name[0]?.toUpperCase() ?? '?'}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{u.name}</span>
                                      {isLive && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 5px' }}>LIVE</span>}
                                      {u.blocked && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--crit)', border: '1px solid var(--crit)', borderRadius: 3, padding: '1px 5px' }}>BLOCKED</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{u.turns} message{u.turns !== 1 ? 's' : ''} observed</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: riskColor, lineHeight: 1 }}>{Math.round(u.maxRisk)}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>peak risk</div>
                                  </div>
                                </div>

                                {/* Risk bar */}
                                <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${u.maxRisk}%`, background: riskColor, borderRadius: 2, transition: 'width 0.4s' }} />
                                </div>

                                {/* Tactic tags */}
                                {u.tactics.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {u.tactics.slice(0, 4).map((t) => (
                                      <span key={t} style={{
                                        padding: '2px 7px',
                                        background: 'rgba(239,68,68,0.1)',
                                        border: '1px solid rgba(239,68,68,0.25)',
                                        borderRadius: 3,
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 10,
                                        color: 'var(--crit)',
                                      }}>
                                        {t.replace(/_/g, ' ')}
                                      </span>
                                    ))}
                                    {u.tactics.length > 4 && (
                                      <span style={{ fontSize: 10, color: 'var(--muted)', padding: '2px 4px' }}>+{u.tactics.length - 4} more</span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Expanded live gauge for the active session user */}
                              {isLive && selectedAlertId === -1 && (
                                <div className="left-stack" style={{ marginTop: 12 }}>
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
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
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
