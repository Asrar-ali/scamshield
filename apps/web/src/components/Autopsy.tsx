import { TACTIC_HUE, TACTIC_LABELS } from '../types';
import { TacticIcon } from './icons';
import { RiskTimeline } from './RiskTimeline';
import type { AutopsyData } from '../lib/autopsy';

interface AutopsyProps {
  data: AutopsyData;
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Turn index a takeover landed on, inferred from the risk trace (one risk
 * sample per scammer turn, excluding the synthetic baseline at t=0). */
function takeoverTurn(data: AutopsyData): number | null {
  const takeover = data.interventions.find((i) => i.level === 'takeover');
  if (!takeover) return null;
  const turn = data.riskSamples.filter((s) => s.ts > data.startTs && s.ts <= takeover.ts).length;
  return turn > 0 ? turn : null;
}

function closingLine(data: AutopsyData): string {
  if (data.outcome === 'caught') {
    const turn = takeoverTurn(data);
    if (turn && data.turns) return `Guardian intervened at turn ${turn} of ${data.turns}.`;
    return `Guardian seized the call at peak risk ${Math.round(data.peakRisk)}.`;
  }
  const turns = `${data.turns} ${data.turns === 1 ? 'turn' : 'turns'}`;
  return `Caller gave up after ${turns} — peak risk ${Math.round(data.peakRisk)}.`;
}

export function Autopsy({ data }: AutopsyProps) {
  const stats = [
    { label: 'Outcome', value: data.outcome === 'caught' ? 'Caught' : 'Gave up', tone: data.outcome === 'caught' ? 'caught' : 'gaveup' },
    { label: 'Duration', value: fmtDuration(data.durationMs) },
    { label: 'Turns', value: String(data.turns) },
    { label: 'Peak risk', value: String(Math.round(data.peakRisk)) },
  ];

  return (
    <section className="panel autopsy" aria-label="Scam autopsy">
      <div className="panel-head">
        <h2>Scam Autopsy</h2>
        <span className="autopsy-alias">{data.alias}</span>
      </div>

      <div className="autopsy-stats">
        {stats.map((s) => (
          <div key={s.label} className={`autopsy-stat ${s.tone ? `autopsy-stat--${s.tone}` : ''}`}>
            <span className="autopsy-stat-value">{s.value}</span>
            <span className="autopsy-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="autopsy-block">
        <span className="autopsy-block-title">Risk timeline</span>
        <RiskTimeline
          samples={data.riskSamples}
          markers={data.tacticMarkers}
          interventions={data.interventions}
          thresholds={data.thresholds}
          startTs={data.startTs}
          endTs={data.endTs}
          variant="full"
        />
      </div>

      <div className="autopsy-block">
        <span className="autopsy-block-title">Tactic ledger</span>
        {data.ledger.length === 0 ? (
          <p className="empty">No tactics detected.</p>
        ) : (
          <div className="autopsy-ledger">
            {data.ledger.map((row) => (
              <div key={row.tactic} className="autopsy-ledger-row" style={{ ['--hue' as string]: TACTIC_HUE[row.tactic] }}>
                <span className="autopsy-ledger-icon">
                  <TacticIcon tactic={row.tactic} width={16} height={16} />
                </span>
                <div className="autopsy-ledger-body">
                  <span className="autopsy-ledger-name">{TACTIC_LABELS[row.tactic]}</span>
                  {row.evidence.length > 0 && (
                    <div className="autopsy-ledger-quotes">
                      {row.evidence.map((q, i) => (
                        <span key={i} className="autopsy-quote">
                          “{q}”
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="autopsy-ledger-count">×{row.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="autopsy-close">{closingLine(data)}</p>
    </section>
  );
}
