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

/** Message index a flag landed on, inferred from the risk trace (one risk
 * sample per analyzed message, excluding the synthetic baseline at t=0). */
function flagTurn(data: AutopsyData): number | null {
  const flag = data.interventions.find((i) => i.level === 'flag');
  if (!flag) return null;
  const turn = data.riskSamples.filter((s) => s.ts > data.startTs && s.ts <= flag.ts).length;
  return turn > 0 ? turn : null;
}

function closingLine(data: AutopsyData): string {
  if (data.outcome === 'caught') {
    const turn = flagTurn(data);
    if (turn && data.turns) return `ScamShield flagged the user at message ${turn} of ${data.turns}.`;
    return `User flagged at peak risk ${Math.round(data.peakRisk)}.`;
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
