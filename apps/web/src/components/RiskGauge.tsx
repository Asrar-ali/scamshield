import { RISK_FLAG_THRESHOLD } from '../types';
import { RiskTimeline } from './RiskTimeline';
import type { RiskSample, TacticMarker, InterventionMoment } from '../lib/autopsy';

const FLAG_THRESHOLD = RISK_FLAG_THRESHOLD;

const CX = 100;
const CY = 100;
const R = 80;
const START_DEG = 135; // value 0 (bottom-left)
const SWEEP_DEG = 270; // 270° open-bottom gauge

interface RiskGaugeProps {
  risk: number;
  /** Live risk trace for the under-gauge sparkline. Absent/short = no sparkline. */
  samples?: RiskSample[];
  markers?: TacticMarker[];
  interventions?: InterventionMoment[];
  startTs?: number | null;
  endTs?: number | null;
}

function pt(deg: number, r = R) {
  const a = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function arc(startDeg: number, endDeg: number, r = R) {
  const s = pt(startDeg, r);
  const e = pt(endDeg, r);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function degFor(value: number) {
  return START_DEG + (value / 100) * SWEEP_DEG;
}

export function RiskGauge({ risk, samples, markers, interventions, startTs, endTs }: RiskGaugeProps) {
  const level = risk >= FLAG_THRESHOLD ? 'critical' : 'low';
  const hasTrace = Boolean(samples && samples.length >= 2 && startTs);
  const clamped = Math.min(100, Math.max(0, risk));
  const valueDeg = degFor(clamped);

  const trackPath = arc(START_DEG, START_DEG + SWEEP_DEG);
  const valuePath = arc(START_DEG, Math.max(START_DEG + 0.01, valueDeg));

  return (
    <div className={`panel gauge-panel risk-${level}`}>
      <div className="panel-head">
        <h2>Scam Risk</h2>
        <span className={`risk-badge risk-badge-${level}`}>{level.toUpperCase()}</span>
      </div>

      <div className="gauge-wrap">
        <svg viewBox="0 0 200 200" className="gauge-svg">
          <defs>
            <linearGradient id="gauge-grad" x1="20" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#43d17f" />
              <stop offset="0.5" stopColor="#ffb020" />
              <stop offset="1" stopColor="#ff4757" />
            </linearGradient>
          </defs>

          <path d={trackPath} className="gauge-track" fill="none" strokeLinecap="round" />
          <path d={valuePath} className="gauge-value" fill="none" stroke="url(#gauge-grad)" strokeLinecap="round" />

          {(() => {
            const d = degFor(FLAG_THRESHOLD);
            const a = pt(d, R + 3);
            const b = pt(d, R - 11);
            return (
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="gauge-tick gauge-tick-flag" strokeLinecap="round" />
            );
          })()}

          <g className="gauge-needle" style={{ transform: `rotate(${(clamped / 100) * SWEEP_DEG}deg)` }}>
            <line x1={CX} y1={CY} x2={pt(START_DEG, R - 16).x} y2={pt(START_DEG, R - 16).y} className="needle-arm" strokeLinecap="round" />
          </g>
          <circle cx={CX} cy={CY} r="6" className="gauge-hub" />
        </svg>

        <div className="gauge-center">
          <div className="risk-score">{Math.round(clamped)}</div>
          <div className="gauge-unit">/ 100</div>
        </div>
      </div>

      <div className="gauge-legend">
        <span className="legend-item">
          <span className="legend-dot flag" /> Flag {FLAG_THRESHOLD}
        </span>
      </div>

      {hasTrace && samples && (
        <RiskTimeline
          samples={samples}
          markers={markers ?? []}
          interventions={interventions ?? []}
          thresholds={{ flag: FLAG_THRESHOLD }}
          startTs={startTs as number}
          endTs={(endTs as number | null) ?? Date.now()}
          variant="spark"
        />
      )}
    </div>
  );
}
