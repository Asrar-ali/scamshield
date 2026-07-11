import { useEffect, useState } from 'react';
import { fetchLeaderboard, type LeaderboardEntry, type TelegramStatus } from '../lib/api';
import { AliasForm } from './AliasForm';
import { RoseAvatar } from './RoseAvatar';
import { TelegramPanel } from './TelegramPanel';
import { ShieldMark } from './icons';

interface LandingProps {
  busy: boolean;
  onStart: (alias: string) => void;
  telegramStatus: TelegramStatus;
  /** Open a past session's Autopsy replay. */
  onReplay: (sessionId: string, alias: string) => void;
  /** Bumped when a call ends so the recent-attempts list refetches. */
  refreshSignal: number;
}

const STATS = [
  { value: '$7.75B', label: 'lost by seniors in 2025 — FBI' },
  { value: '11', label: 'manipulation tactics detected live' },
  { value: '<1s', label: 'from red flag to takeover' },
];

/** Idle landing hero — the pitch, the persona, and the call-to-action. */
export function Landing({ busy, onStart, telegramStatus, onReplay, refreshSignal }: LandingProps) {
  const [recent, setRecent] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchLeaderboard();
      if (!cancelled) setRecent(data.slice(0, 4));
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  return (
    <div className="landing">
      <div className="landing-copy">
        <span className="landing-eyebrow">
          <ShieldMark width={16} height={16} />
          Real-time scam defense
        </span>
        <h1 className="landing-title">
          Think you can scam
          <br />
          an <span className="grad">AI grandma?</span>
        </h1>
        <p className="landing-sub">
          Meet Rose. Play the scammer and watch ScamShield name every manipulation tactic as you
          use it — then seize the call before the damage is done. The bodyguard, not the autopsy.
        </p>

        <AliasForm busy={busy} ended={false} onStart={onStart} variant="hero" />

        <div className="landing-stats">
          {STATS.map((s) => (
            <div key={s.label} className="stat-chip">
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        <TelegramPanel status={telegramStatus} />

        {recent.length > 0 && (
          <div className="landing-recents">
            <span className="landing-recents-title">Past attempts · click to replay</span>
            <div className="landing-recents-list">
              {recent.map((e) => (
                <button
                  key={e.sessionId}
                  type="button"
                  className="landing-recent-row"
                  onClick={() => onReplay(e.sessionId, e.alias)}
                >
                  <span className="landing-recent-alias">{e.alias || 'Anonymous Scammer'}</span>
                  <span className={`landing-recent-outcome lb-${e.outcome}`}>
                    {e.outcome === 'caught' ? 'Caught' : 'Gave up'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="landing-call">
        <div className="incoming-card">
          <span className="incoming-tag">Incoming call</span>
          <RoseAvatar size={132} ringing />
          <div className="incoming-name">Rose</div>
          <div className="incoming-meta">78 · Ottawa · lives alone</div>
          <div className="incoming-hint">
            <span className="dot-ring" aria-hidden="true" />
            Ringing… pick up as the scammer
          </div>
        </div>
      </div>
    </div>
  );
}
