import { randomUUID } from 'node:crypto';
import type { Contact, ContactChannel, NotifyOn, PersonaSettings, Sensitivity, Settings, VoiceSettings } from './types.js';
import type { Store } from './store.js';
import { curatedModelIds } from './gemini.js';
import { log } from './log.js';

const MAX_CONTACTS = 5;
const MAX_NAME_LENGTH = 40;
const MAX_ADDRESS_LENGTH = 120;
const MAX_VOICE_LENGTH = 64;
const MAX_PERSONA_SHORT_LENGTH = 40;
const MAX_PERSONA_QUIRKS_LENGTH = 200;
const MIN_PERSONA_AGE = 1;
const MAX_PERSONA_AGE = 120;

export function defaultSettings(): Settings {
  return {
    protectedName: 'Rose',
    notifyOn: 'takeover',
    contacts: [],
    model: '',
    voices: { grandma: '', guardian: '' },
    sensitivity: 'balanced',
    persona: { name: 'Rose', age: 78, city: 'Ottawa', grandkid: 'Tyler', quirks: 'gardening, a cat named Muffin, an old flip phone' },
  };
}

export type SettingsValidation = { ok: true; settings: Settings } | { ok: false; error: string };

function isNotifyOn(value: unknown): value is NotifyOn {
  return value === 'coach' || value === 'takeover';
}

function isSensitivity(value: unknown): value is Sensitivity {
  return value === 'relaxed' || value === 'balanced' || value === 'paranoid';
}

function isValidModel(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  return curatedModelIds().includes(value);
}

function isContactChannel(value: unknown): value is ContactChannel {
  return value === 'telegram' || value === 'imessage';
}

function validateVoices(raw: unknown): VoiceSettings | { error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { error: 'voices must be an object' };
  }
  const v = raw as Record<string, unknown>;
  if (typeof v.grandma !== 'string') return { error: 'voices.grandma must be a string' };
  if (typeof v.guardian !== 'string') return { error: 'voices.guardian must be a string' };
  if (v.grandma.length > MAX_VOICE_LENGTH) return { error: `voices.grandma must not exceed ${MAX_VOICE_LENGTH} characters` };
  if (v.guardian.length > MAX_VOICE_LENGTH) return { error: `voices.guardian must not exceed ${MAX_VOICE_LENGTH} characters` };
  return { grandma: v.grandma.trim(), guardian: v.guardian.trim() };
}

function validatePersona(raw: unknown): PersonaSettings | { error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { error: 'persona must be an object' };
  }
  const p = raw as Record<string, unknown>;

  if (typeof p.name !== 'string' || p.name.trim().length === 0) return { error: 'persona.name must be a non-empty string' };
  if (p.name.trim().length > MAX_PERSONA_SHORT_LENGTH) {
    return { error: `persona.name must not exceed ${MAX_PERSONA_SHORT_LENGTH} characters` };
  }

  if (typeof p.city !== 'string' || p.city.trim().length === 0) return { error: 'persona.city must be a non-empty string' };
  if (p.city.trim().length > MAX_PERSONA_SHORT_LENGTH) {
    return { error: `persona.city must not exceed ${MAX_PERSONA_SHORT_LENGTH} characters` };
  }

  if (typeof p.grandkid !== 'string' || p.grandkid.trim().length === 0) return { error: 'persona.grandkid must be a non-empty string' };
  if (p.grandkid.trim().length > MAX_PERSONA_SHORT_LENGTH) {
    return { error: `persona.grandkid must not exceed ${MAX_PERSONA_SHORT_LENGTH} characters` };
  }

  if (typeof p.quirks !== 'string' || p.quirks.trim().length === 0) return { error: 'persona.quirks must be a non-empty string' };
  if (p.quirks.trim().length > MAX_PERSONA_QUIRKS_LENGTH) {
    return { error: `persona.quirks must not exceed ${MAX_PERSONA_QUIRKS_LENGTH} characters` };
  }

  if (typeof p.age !== 'number' || !Number.isInteger(p.age) || p.age < MIN_PERSONA_AGE || p.age > MAX_PERSONA_AGE) {
    return { error: `persona.age must be an integer between ${MIN_PERSONA_AGE} and ${MAX_PERSONA_AGE}` };
  }

  return {
    name: p.name.trim(),
    age: p.age,
    city: p.city.trim(),
    grandkid: p.grandkid.trim(),
    quirks: p.quirks.trim(),
  };
}

function validateContact(raw: unknown, index: number): Contact | { error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { error: `contacts[${index}] must be an object` };
  }
  const c = raw as Record<string, unknown>;

  if (typeof c.name !== 'string' || c.name.trim().length === 0) {
    return { error: `contacts[${index}].name must be a non-empty string` };
  }
  if (!isContactChannel(c.channel)) {
    return { error: `contacts[${index}].channel must be 'telegram' or 'imessage'` };
  }
  if (typeof c.address !== 'string' || c.address.trim().length === 0) {
    return { error: `contacts[${index}].address must be a non-empty string` };
  }

  const id = typeof c.id === 'string' && c.id.trim().length > 0 ? c.id.trim() : randomUUID();
  return {
    id,
    name: c.name.trim().slice(0, MAX_NAME_LENGTH),
    channel: c.channel,
    address: c.address.trim().slice(0, MAX_ADDRESS_LENGTH),
  };
}

export function validateSettings(body: unknown): SettingsValidation {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'settings body must be an object' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.protectedName !== 'string') {
    return { ok: false, error: 'protectedName must be a string' };
  }
  const protectedName = b.protectedName.trim().slice(0, MAX_NAME_LENGTH);
  if (protectedName.length === 0) {
    return { ok: false, error: 'protectedName must not be empty' };
  }

  if (!isNotifyOn(b.notifyOn)) {
    return { ok: false, error: "notifyOn must be 'coach' or 'takeover'" };
  }

  if (!Array.isArray(b.contacts)) {
    return { ok: false, error: 'contacts must be an array' };
  }
  if (b.contacts.length > MAX_CONTACTS) {
    return { ok: false, error: `contacts must not exceed ${MAX_CONTACTS}` };
  }

  const contacts: Contact[] = [];
  for (let i = 0; i < b.contacts.length; i += 1) {
    const result = validateContact(b.contacts[i], i);
    if ('error' in result) return { ok: false, error: result.error };
    contacts.push(result);
  }

  // New fields are additive: omitted in the request body -> default, so older
  // clients that only know protectedName/notifyOn/contacts keep working. When
  // present, each is validated strictly.
  const defaults = defaultSettings();

  let model = defaults.model;
  if (b.model !== undefined) {
    if (!isValidModel(b.model)) {
      return { ok: false, error: `model must be '' or one of: ${curatedModelIds().join(', ')}` };
    }
    model = b.model;
  }

  let voices = defaults.voices;
  if (b.voices !== undefined) {
    const result = validateVoices(b.voices);
    if ('error' in result) return { ok: false, error: result.error };
    voices = result;
  }

  let sensitivity = defaults.sensitivity;
  if (b.sensitivity !== undefined) {
    if (!isSensitivity(b.sensitivity)) {
      return { ok: false, error: "sensitivity must be 'relaxed', 'balanced', or 'paranoid'" };
    }
    sensitivity = b.sensitivity;
  }

  let persona = defaults.persona;
  if (b.persona !== undefined) {
    const result = validatePersona(b.persona);
    if ('error' in result) return { ok: false, error: result.error };
    persona = result;
  }

  return { ok: true, settings: { protectedName, notifyOn: b.notifyOn, contacts, model, voices, sensitivity, persona } };
}

export interface SettingsManager {
  get(): Settings;
  set(next: Settings): void;
}

/**
 * In-memory settings holder that mirrors writes through to the Store when the
 * Store implements the optional saveSettings/getSettings persistence hooks
 * (e.g. Mongo). Falls back to sensible defaults and never throws.
 */
export function createSettingsManager(store: Store): SettingsManager {
  let current: Settings = defaultSettings();

  if (store.getSettings) {
    store
      .getSettings()
      .then((loaded) => {
        if (loaded) current = loaded;
      })
      .catch((err) => log.warn('settings hydrate from store failed:', err instanceof Error ? err.message : err));
  }

  return {
    get: () => current,
    set: (next) => {
      current = next;
      if (store.saveSettings) {
        try {
          store.saveSettings(next);
        } catch (err) {
          log.warn('store.saveSettings threw:', err instanceof Error ? err.message : err);
        }
      }
    },
  };
}
