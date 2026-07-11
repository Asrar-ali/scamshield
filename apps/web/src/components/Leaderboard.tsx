import { useEffect, useState } from 'react';
import { fetchLeaderboard, type LeaderboardEntry } from '../lib/api';

const POLL_INTERVAL_MS = 30_000;
const MEDALS = ['gold', 'silver', 'bronze'];

interface LeaderboardProps {
  /** Bump to force an immediate refetch (e.g. right after a session ends). */
  refreshSignal: number;
}

export function Leaderboard({ refreshSignal }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

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

  return (
    <div className="panel leaderboard-panel">
      <div className="panel-head">
        <h2>Leaderboard</h2>
        <span className="lb-subtitle">turns survived</span>
      </div>
      <div className="leaderboard">
        {loaded && sorted.length === 0 && <p className="empty">No attempts yet — be the first.</p>}
        {!loaded && <p className="empty">Loading…</p>}
        {sorted.map((e, i) => (
          <div key={e.sessionId} className={`leaderboard-row ${i < 3 ? `rank-${MEDALS[i]}` : ''}`}>
            <span className="lb-rank">{i + 1}</span>
            <span className="lb-alias">{e.alias || 'Anonymous Scammer'}</span>
            <span className="lb-turns">{e.turns}</span>
            <span className={`lb-outcome lb-${e.outcome}`}>{e.outcome === 'caught' ? 'Caught' : 'Gave up'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
