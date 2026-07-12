import type { Sensitivity, Thresholds } from '../../lib/api';

interface SensitivityControlProps {
  sensitivity: Sensitivity;
  thresholds: Thresholds;
  onChange: (sensitivity: Sensitivity) => void;
}

const OPTIONS: { id: Sensitivity; label: string; blurb: string }[] = [
  { id: 'relaxed', label: 'Relaxed', blurb: 'Flags only higher-risk messages.' },
  { id: 'balanced', label: 'Balanced', blurb: 'Default flag threshold.' },
  { id: 'paranoid', label: 'Paranoid', blurb: 'Flags sooner than Balanced.' },
];

export function SensitivityControl({ sensitivity, thresholds, onChange }: SensitivityControlProps) {
  return (
    <section className="settings-section">
      <h3>Sensitivity</h3>
      <div className="segmented" role="radiogroup" aria-label="Sensitivity">
        {OPTIONS.map((opt) => {
          const active = sensitivity === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`segmented-option ${active ? 'is-active' : ''}`}
              onClick={() => onChange(opt.id)}
            >
              {opt.label}
              <span className="segmented-option-desc">
                {active ? `Flags at risk ${thresholds.flag}.` : opt.blurb}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
