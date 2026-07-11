const COACH_THRESHOLD = 45;
const TAKEOVER_THRESHOLD = 80;

interface RiskGaugeProps {
  risk: number;
}

export function RiskGauge({ risk }: RiskGaugeProps) {
  const level = risk >= TAKEOVER_THRESHOLD ? 'critical' : risk >= COACH_THRESHOLD ? 'elevated' : 'low';
  const clamped = Math.min(100, Math.max(0, risk));

  return (
    <div className={`panel risk risk-${level}`}>
      <h2>Scam Risk</h2>
      <div className="risk-score">{Math.round(clamped)}</div>
      <div className="risk-track">
        <div className="risk-fill" style={{ width: `${clamped}%` }} />
        <div className="risk-tick" style={{ left: `${COACH_THRESHOLD}%` }}>
          <span className="tick-label">COACH · {COACH_THRESHOLD}</span>
        </div>
        <div className="risk-tick" style={{ left: `${TAKEOVER_THRESHOLD}%` }}>
          <span className="tick-label">TAKEOVER · {TAKEOVER_THRESHOLD}</span>
        </div>
      </div>
      <div className="risk-label">{level.toUpperCase()}</div>
    </div>
  );
}
