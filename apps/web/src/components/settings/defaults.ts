import type { Persona, Sensitivity, Settings } from '../../lib/api';

export const DEFAULT_PERSONA: Persona = { name: 'Rose', age: 78, city: '', grandkid: '', quirks: '' };

export const DEFAULT_SETTINGS: Settings = {
  protectedName: 'Rose',
  notifyOn: 'takeover',
  contacts: [],
  model: '',
  voices: { grandma: '', guardian: '' },
  sensitivity: 'balanced',
  persona: DEFAULT_PERSONA,
  thresholds: { coach: 55, takeover: 90 },
};

/** Fills in any field the server doesn't (yet) send with a fallback — either the shipped
 * default, or the caller's own optimistic value. Keeps the settings surfaces usable while
 * the server-side contract for model/voices/sensitivity/persona/thresholds is still landing. */
export function normalizeSettings(raw: unknown, fallback: Settings): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const isSensitivity = (v: unknown): v is Sensitivity => v === 'relaxed' || v === 'balanced' || v === 'paranoid';
  return {
    protectedName: typeof r.protectedName === 'string' && r.protectedName.length > 0 ? r.protectedName : fallback.protectedName,
    notifyOn: r.notifyOn === 'coach' || r.notifyOn === 'takeover' ? r.notifyOn : fallback.notifyOn,
    contacts: Array.isArray(r.contacts) ? r.contacts : fallback.contacts,
    model: typeof r.model === 'string' && r.model.length > 0 ? r.model : fallback.model,
    voices: {
      grandma: typeof r.voices?.grandma === 'string' && r.voices.grandma ? r.voices.grandma : fallback.voices.grandma,
      guardian: typeof r.voices?.guardian === 'string' && r.voices.guardian ? r.voices.guardian : fallback.voices.guardian,
    },
    sensitivity: isSensitivity(r.sensitivity) ? r.sensitivity : fallback.sensitivity,
    persona: {
      name: typeof r.persona?.name === 'string' ? r.persona.name : fallback.persona.name,
      age: typeof r.persona?.age === 'number' ? r.persona.age : fallback.persona.age,
      city: typeof r.persona?.city === 'string' ? r.persona.city : fallback.persona.city,
      grandkid: typeof r.persona?.grandkid === 'string' ? r.persona.grandkid : fallback.persona.grandkid,
      quirks: typeof r.persona?.quirks === 'string' ? r.persona.quirks : fallback.persona.quirks,
    },
    thresholds: {
      coach: typeof r.thresholds?.coach === 'number' ? r.thresholds.coach : fallback.thresholds.coach,
      takeover: typeof r.thresholds?.takeover === 'number' ? r.thresholds.takeover : fallback.thresholds.takeover,
    },
  };
}
