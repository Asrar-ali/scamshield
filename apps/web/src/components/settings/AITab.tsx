import { ModelPicker } from './ModelPicker';

interface AITabProps {
  settings: { model: string };
  onModelChange: (model: string) => void;
}

/** AI tab: which Gemini model runs the scam-detection analyst. */
export function AITab({ settings, onModelChange }: AITabProps) {
  return (
    <section className="settings-section">
      <h3>Detection model</h3>
      <p className="settings-hint">
        The Gemini model that classifies each observed message against the tactic taxonomy.
        Leave unset to use the server default.
      </p>
      <ModelPicker selected={settings.model} onSelect={onModelChange} />
    </section>
  );
}
