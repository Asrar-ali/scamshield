import type { Sensitivity, Settings } from '../../lib/api';

export const DEFAULT_SETTINGS: Settings = {
  serverName: 'ScamShield',
  contacts: [],
  model: '',
  sensitivity: 'balanced',
  thresholds: { flag: 50 },
};

/** Fills in any field the server doesn't (yet) send with a fallback — either the
 * shipped default, or the caller's own optimistic value. Keeps the settings
 * surfaces usable while the server-side contract for model/sensitivity/thresholds
 * is still landing. */
export function normalizeSettings(raw: unknown, fallback: Settings): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const isSensitivity = (v: unknown): v is Sensitivity => v === 'relaxed' || v === 'balanced' || v === 'paranoid';
  return {
    serverName: typeof r.serverName === 'string' && r.serverName.length > 0 ? r.serverName : fallback.serverName,
    contacts: Array.isArray(r.contacts) ? r.contacts : fallback.contacts,
    model: typeof r.model === 'string' && r.model.length > 0 ? r.model : fallback.model,
    sensitivity: isSensitivity(r.sensitivity) ? r.sensitivity : fallback.sensitivity,
    thresholds: {
      flag: typeof r.thresholds?.flag === 'number' ? r.thresholds.flag : fallback.thresholds.flag,
    },
  };
}
