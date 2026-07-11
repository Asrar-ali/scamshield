import { useEffect, useState } from 'react';
import { fetchAnalytics, type Analytics } from '../lib/api';
import { TACTIC_HUE } from '../types';
import { TacticIcon } from './icons';

const POLL_INTERVAL_MS = 30_000;
const TOP_TACTICS = 6;

interface ThreatIntelProps {
  /** Bump to force an immediate refetch (e.g. right after a session ends). */
  refreshSignal: number;
}

export function ThreatIntel({ refreshSignal }: ThreatIntelProps) {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchAnalytics();
      if (!cancelled) setData(next);
    };
    void load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshSignal]);

  if (!data || data.totalCalls === 0) {
    return <p className="empty">No calls yet.</p>;
  }

  const stats = [
    { label: 'Calls', value: String(data.totalCalls) },
    { label: 'Catch rate', value: `${Math.round(data.catchRate * 100)}%` },
    { label: 'Turns to catch', value: data.avgTurnsToCatch ? data.avgTurnsToCatch.toFixed(1) : '—' },
    { label: 'Alerts sent', value: String(data.totalAlertsSent) },
  ];

  const bars = data.tacticFrequency.slice(0, TOP_TACTICS);
  const maxCount = bars.reduce((max, b) => Math.max(max, b.count), 0) || 1;

  return (
    <div className="threat-intel">
      <div className="ti-stats">
        {stats.map((s) => (
          <div key={s.label} className="ti-stat">
            <span className="ti-stat-value">{s.value}</span>
            <span className="ti-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {bars.length > 0 && (
        <div className="ti-bars">
          {bars.map((b) => (
            <div key={b.tactic} className="ti-bar-row" style={{ ['--hue' as string]: TACTIC_HUE[b.tactic] }}>
              <span className="ti-bar-icon">
                <TacticIcon tactic={b.tactic} width={15} height={15} />
              </span>
              <span className="ti-bar-label">{b.label}</span>
              <span className="ti-bar-track">
                <span className="ti-bar-fill" style={{ width: `${(b.count / maxCount) * 100}%` }} />
              </span>
              <span className="ti-bar-count">{b.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
