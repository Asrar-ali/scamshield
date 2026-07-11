export interface Intervention {
  level: 'coach' | 'takeover' | 'alert';
  text: string;
  ts: number;
}

interface InterventionsPanelProps {
  interventions: Intervention[];
}

export function InterventionsPanel({ interventions }: InterventionsPanelProps) {
  return (
    <div className="panel">
      <h2>Guardian Interventions</h2>
      <div className="interventions">
        {interventions.length === 0 && <p className="empty">Guardian is watching silently.</p>}
        {interventions.map((iv, i) => (
          <div key={i} className={`intervention ${iv.level}`}>
            <span className="level">{iv.level.toUpperCase()}</span>
            <p>{iv.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
