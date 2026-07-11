import type { TacticId } from '../types';
import { TACTIC_LABELS } from '../types';

export interface TacticHit {
  tactic: TacticId;
  confidence: number;
  evidence: string;
  ts: number;
}

interface TacticsPanelProps {
  hits: TacticHit[];
}

export function TacticsPanel({ hits }: TacticsPanelProps) {
  const activeTactics = [...new Set(hits.map((h) => h.tactic))];

  return (
    <div className="panel">
      <h2>Manipulation Tactics Detected</h2>
      <div className="tactics">
        {activeTactics.length === 0 && <p className="empty">Nothing yet. Rose is safe… for now.</p>}
        {activeTactics.map((t, i) => {
          const latest = hits.find((h) => h.tactic === t);
          if (!latest) return null;
          return (
            <div key={t} className="tactic-card" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="tactic-name">{TACTIC_LABELS[t]}</div>
              <div className="tactic-evidence">“{latest.evidence}”</div>
              <div className="tactic-conf">{Math.round(latest.confidence * 100)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
