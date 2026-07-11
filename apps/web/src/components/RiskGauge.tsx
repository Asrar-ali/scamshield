const COACH_THRESHOLD = 45;
const TAKEOVER_THRESHOLD = 80;

const CX = 100;
const CY = 100;
const R = 80;
const START_DEG = 135; // value 0 (bottom-left)
const SWEEP_DEG = 270; // 270° open-bottom gauge

interface RiskGaugeProps {
  risk: number;
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

export function RiskGauge({ risk }: RiskGaugeProps) {
  const level = risk >= TAKEOVER_THRESHOLD ? 'critical' : risk >= COACH_THRESHOLD ? 'elevated' : 'low';
  const clamped = Math.min(100, Math.max(0, risk));
  const valueDeg = degFor(clamped);

  const trackPath = arc(START_DEG, START_DEG + SWEEP_DEG);
  const valuePath = arc(START_DEG, Math.max(START_DEG + 0.01, valueDeg));

  const ticks = [
    { at: COACH_THRESHOLD, label: 'COACH', cls: 'coach' },
    { at: TAKEOVER_THRESHOLD, label: 'TAKEOVER', cls: 'takeover' },
  ];

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

          {ticks.map((t) => {
            const d = degFor(t.at);
            const a = pt(d, R + 3);
            const b = pt(d, R - 11);
            return (
              <line
                key={t.at}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={`gauge-tick gauge-tick-${t.cls}`}
                strokeLinecap="round"
              />
            );
          })}

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
          <span className="legend-dot coach" /> Coach {COACH_THRESHOLD}
        </span>
        <span className="legend-item">
          <span className="legend-dot takeover" /> Takeover {TAKEOVER_THRESHOLD}
        </span>
      </div>
    </div>
  );
}
