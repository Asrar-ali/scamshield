import type { TacticId } from '../types';
import { TACTIC_LABELS } from '../types';
import { TacticIcon } from './icons';

export interface TacticHit {
  tactic: TacticId;
  confidence: number;
  evidence: string;
  ts: number;
}

interface TacticsPanelProps {
  hits: TacticHit[];
}

/** A distinct hue per tactic so the ops rail reads as a varied threat board,
 * not one wall of amber. */
const TACTIC_HUE: Record<TacticId, string> = {
  urgency_pressure: '#ffb020',
  authority_impersonation: '#a78bfa',
  payment_redirection: '#f472b6',
  isolation_secrecy: '#60a5fa',
  emotional_manipulation: '#fb7185',
  trust_building: '#34d399',
  verification_blocking: '#f59e0b',
  remote_access: '#22d3ee',
  info_harvesting: '#c084fc',
  prompt_injection: '#f43f5e',
  generic_pressure: '#94a3b8',
};

export function TacticsPanel({ hits }: TacticsPanelProps) {
  const activeTactics = [...new Set(hits.map((h) => h.tactic))];

  return (
    <div className="panel tactics-panel">
      <div className="panel-head">
        <h2>Manipulation Tactics Detected</h2>
        {activeTactics.length > 0 && <span className="count-pill">{activeTactics.length}</span>}
      </div>
      <div className="tactics">
        {activeTactics.length === 0 && (
          <p className="empty tactics-empty">
            <span className="empty-icon" aria-hidden="true">◇</span>
            No tactics detected yet.
          </p>
        )}
        {activeTactics.map((t, i) => {
          const latest = hits.find((h) => h.tactic === t);
          if (!latest) return null;
          const repeats = hits.filter((h) => h.tactic === t).length;
          const hue = TACTIC_HUE[t];
          const pct = Math.round(latest.confidence * 100);
          return (
            <div
              key={t}
              className="tactic-card"
              style={{ animationDelay: `${i * 70}ms`, ['--hue' as string]: hue }}
            >
              <div className="tactic-top">
                <span className="tactic-icon">
                  <TacticIcon tactic={t} width={18} height={18} />
                </span>
                <span className="tactic-name">{TACTIC_LABELS[t]}</span>
                {repeats > 1 && <span className="tactic-count">×{repeats}</span>}
                <span className="tactic-conf">{pct}%</span>
              </div>
              <div className="tactic-evidence">“{latest.evidence}”</div>
              <div className="tactic-meter">
                <span className="tactic-meter-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
