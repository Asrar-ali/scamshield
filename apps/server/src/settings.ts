import { randomUUID } from 'node:crypto';
import type { Contact, ContactChannel, Sensitivity, Settings } from './types.js';
import type { Store } from './store.js';
import { curatedModelIds } from './gemini.js';
import { log } from './log.js';

const MAX_CONTACTS = 5;
const MAX_NAME_LENGTH = 40;
const MAX_ADDRESS_LENGTH = 120;

export function defaultSettings(): Settings {
  return {
    serverName: 'ScamShield',
    contacts: [],
    model: '',
    sensitivity: 'balanced',
  };
}

export type SettingsValidation = { ok: true; settings: Settings } | { ok: false; error: string };

function isSensitivity(value: unknown): value is Sensitivity {
  return value === 'relaxed' || value === 'balanced' || value === 'paranoid';
}

function isValidModel(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  return curatedModelIds().includes(value);
}

function isContactChannel(value: unknown): value is ContactChannel {
  return value === 'discord' || value === 'imessage';
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
    return { error: `contacts[${index}].channel must be 'discord' or 'imessage'` };
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

  if (typeof b.serverName !== 'string') {
    return { ok: false, error: 'serverName must be a string' };
  }
  const serverName = b.serverName.trim().slice(0, MAX_NAME_LENGTH);
  if (serverName.length === 0) {
    return { ok: false, error: 'serverName must not be empty' };
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
  // clients that only know serverName/contacts keep working. When present, each
  // is validated strictly.
  const defaults = defaultSettings();

  let model = defaults.model;
  if (b.model !== undefined) {
    if (!isValidModel(b.model)) {
      return { ok: false, error: `model must be '' or one of: ${curatedModelIds().join(', ')}` };
    }
    model = b.model;
  }

  let sensitivity = defaults.sensitivity;
  if (b.sensitivity !== undefined) {
    if (!isSensitivity(b.sensitivity)) {
      return { ok: false, error: "sensitivity must be 'relaxed', 'balanced', or 'paranoid'" };
    }
    sensitivity = b.sensitivity;
  }

  return { ok: true, settings: { serverName, contacts, model, sensitivity } };
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
