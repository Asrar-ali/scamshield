import { useEffect, useState } from 'react';
import { fetchLeaderboard, type LeaderboardEntry } from '../lib/api';
import { ThreatIntel } from './ThreatIntel';

const POLL_INTERVAL_MS = 30_000;
const MEDALS = ['gold', 'silver', 'bronze'];

type View = 'leaderboard' | 'intel';

interface LeaderboardProps {
  /** Bump to force an immediate refetch (e.g. right after a session ends). */
  refreshSignal: number;
  /** Open the replay Autopsy for a past session. Rows are inert when omitted. */
  onReplay?: (sessionId: string, alias: string) => void;
}

export function Leaderboard({ refreshSignal, onReplay }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('leaderboard');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const data = await fetchLeaderboard();
      if (!cancelled) {
        setEntries(data);
        setLoaded(true);
      }
    };
    void load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshSignal]);

  const sorted = [...entries].sort((a, b) => b.turns - a.turns);
  const clickable = Boolean(onReplay);

  return (
    <div className="panel leaderboard-panel">
      <div className="panel-head">
        <div className="seg-toggle" role="tablist" aria-label="Panel view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'leaderboard'}
            className={`seg-btn ${view === 'leaderboard' ? 'is-active' : ''}`}
            onClick={() => setView('leaderboard')}
          >
            Leaderboard
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'intel'}
            className={`seg-btn ${view === 'intel' ? 'is-active' : ''}`}
            onClick={() => setView('intel')}
          >
            Threat Intel
          </button>
        </div>
        {view === 'leaderboard' && <span className="lb-subtitle">messages before caught</span>}
      </div>

      {view === 'leaderboard' ? (
        <div className="leaderboard">
          {loaded && sorted.length > 0 && (
            <p className="lb-record">
              {sorted.length} scam {sorted.length === 1 ? 'attempt' : 'attempts'} · 0 got through
            </p>
          )}
          {loaded && sorted.length === 0 && <p className="empty">No scam attempts yet.</p>}
          {!loaded && <p className="empty">Loading…</p>}
          {sorted.map((e, i) => (
            <div
              key={e.sessionId}
              className={`leaderboard-row ${i < 3 ? `rank-${MEDALS[i]}` : ''} ${clickable ? 'is-clickable' : ''}`}
              {...(clickable
                ? {
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => onReplay?.(e.sessionId, e.alias),
                    onKeyDown: (ev: React.KeyboardEvent) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        onReplay?.(e.sessionId, e.alias);
                      }
                    },
                  }
                : {})}
            >
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-alias">{e.alias || 'Anonymous Scammer'}</span>
              <span className="lb-turns">{e.turns} {e.turns === 1 ? 'msg' : 'msgs'}</span>
              <span className={`lb-outcome lb-${e.outcome}`}>{e.outcome === 'caught' ? 'Caught' : 'Gave up'}</span>
            </div>
          ))}
        </div>
      ) : (
        <ThreatIntel refreshSignal={refreshSignal} />
      )}
    </div>
  );
}
