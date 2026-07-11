import type { Persona, Sensitivity, Settings } from '../../lib/api';
import { PersonaEditor } from './PersonaEditor';
import { SensitivityControl } from './SensitivityControl';

interface ProtectionTabProps {
  settings: Settings;
  onPersonaChange: (persona: Persona) => void;
  onSensitivityChange: (sensitivity: Sensitivity) => void;
}

/** PROTECTION tab: who the agent is protecting, and how aggressively it acts. */
export function ProtectionTab({ settings, onPersonaChange, onSensitivityChange }: ProtectionTabProps) {
  return (
    <>
      <PersonaEditor persona={settings.persona} onChange={onPersonaChange} />
      <SensitivityControl sensitivity={settings.sensitivity} thresholds={settings.thresholds} onChange={onSensitivityChange} />
    </>
  );
}
