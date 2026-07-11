import { SirenIcon, WhisperIcon } from './icons';

export interface Intervention {
  level: 'coach' | 'takeover' | 'alert';
  text: string;
  ts: number;
}

interface InterventionsPanelProps {
  interventions: Intervention[];
}

const LEVEL_LABEL: Record<Intervention['level'], string> = {
  coach: 'Coaching whisper',
  takeover: 'Guardian takeover',
  alert: 'Family alert',
};

export function InterventionsPanel({ interventions }: InterventionsPanelProps) {
  return (
    <div className="panel guardian-panel">
      <div className="panel-head">
        <h2>Guardian Interventions</h2>
      </div>
      <div className="interventions">
        {interventions.length === 0 && (
          <p className="empty guardian-empty">
            <span className="guardian-eye" aria-hidden="true" />
            Guardian is watching silently.
          </p>
        )}
        {interventions.map((iv, i) => (
          <div key={i} className={`intervention ${iv.level}`}>
            <span className="iv-icon" aria-hidden="true">
              {iv.level === 'coach' ? <WhisperIcon width={16} height={16} /> : <SirenIcon width={16} height={16} />}
            </span>
            <div className="iv-body">
              <span className="level">{LEVEL_LABEL[iv.level]}</span>
              <p>{iv.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
