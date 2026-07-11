import { describe, expect, it, vi } from 'vitest';
import { createSettingsManager, defaultSettings, validateSettings } from './settings.js';
import { createInMemoryStore, type Store } from './store.js';
import type { Settings } from './types.js';

function validPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    protectedName: 'Rose',
    notifyOn: 'takeover',
    contacts: [],
    ...overrides,
  };
}

/** Builds a full Settings object (all additive fields at their defaults) for tests
 * that exercise settings-manager plumbing rather than the new fields themselves. */
function fullSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), ...overrides };
}

/** createInMemoryStore always implements the optional settings hooks concretely. */
function concreteStore(): Store & { saveSettings: NonNullable<Store['saveSettings']>; getSettings: NonNullable<Store['getSettings']> } {
  return createInMemoryStore() as ReturnType<typeof concreteStore>;
}

describe('defaultSettings', () => {
  // Settings grew additive fields (model/voices/sensitivity/persona) for runtime
  // configuration — this assertion is updated to the new full shape; every field
  // still defaults exactly as documented in the contract.
  it('defaults to Rose, takeover-only, no contacts, balanced sensitivity, and the Rose persona', () => {
    expect(defaultSettings()).toEqual({
      protectedName: 'Rose',
      notifyOn: 'takeover',
      contacts: [],
      model: '',
      voices: { grandma: '', guardian: '' },
      sensitivity: 'balanced',
      persona: { name: 'Rose', age: 78, city: 'Ottawa', grandkid: 'Tyler', quirks: 'gardening, a cat named Muffin, an old flip phone' },
    });
  });

  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = defaultSettings();
    const b = defaultSettings();
    a.contacts.push({ id: 'x', name: 'x', channel: 'telegram', address: 'x' });
    expect(b.contacts).toEqual([]);
  });
});

describe('validateSettings', () => {
  // A minimal (old-shape) payload omits model/voices/sensitivity/persona entirely —
  // updated to assert they fill in with defaults, proving the additive/backward-
  // compatible contract rather than the pre-additive 3-field shape.
  it('accepts a minimal valid payload and fills in defaults for the additive fields', () => {
    const result = validateSettings(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings).toEqual(defaultSettings());
    }
  });

  it('round-trips a full payload including contacts', () => {
    const payload = validPayload({
      notifyOn: 'coach',
      contacts: [{ id: 'c1', name: 'Sarah', channel: 'telegram', address: '123456' }],
    });
    const result = validateSettings(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.contacts).toEqual([{ id: 'c1', name: 'Sarah', channel: 'telegram', address: '123456' }]);
    }
  });

  it('generates an id when a contact omits one', () => {
    const result = validateSettings(validPayload({ contacts: [{ name: 'Sarah', channel: 'imessage', address: 'sarah@example.com' }] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.contacts[0].id).toBeTruthy();
    }
  });

  it('trims and length-caps protectedName', () => {
    const long = 'a'.repeat(80);
    const result = validateSettings(validPayload({ protectedName: `  ${long}  ` }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.protectedName.length).toBeLessThanOrEqual(40);
    }
  });

  it('trims and length-caps contact name and address', () => {
    const longName = 'b'.repeat(80);
    const longAddress = 'c'.repeat(200);
    const result = validateSettings(
      validPayload({ contacts: [{ name: `  ${longName}  `, channel: 'telegram', address: `  ${longAddress}  ` }] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.contacts[0].name.length).toBeLessThanOrEqual(40);
      expect(result.settings.contacts[0].address.length).toBeLessThanOrEqual(120);
      expect(result.settings.contacts[0].name.startsWith(' ')).toBe(false);
    }
  });

  it('rejects a non-object body', () => {
    expect(validateSettings(null).ok).toBe(false);
    expect(validateSettings('nope').ok).toBe(false);
  });

  it('rejects a missing/non-string protectedName', () => {
    const result = validateSettings(validPayload({ protectedName: 42 as unknown as string }));
    expect(result.ok).toBe(false);
  });

  it('rejects an empty protectedName after trimming', () => {
    const result = validateSettings(validPayload({ protectedName: '   ' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid notifyOn', () => {
    const result = validateSettings(validPayload({ notifyOn: 'always' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a non-array contacts field', () => {
    const result = validateSettings(validPayload({ contacts: 'nope' }));
    expect(result.ok).toBe(false);
  });

  it('rejects more than 5 contacts', () => {
    const contacts = Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, channel: 'telegram', address: `${i}` }));
    const result = validateSettings(validPayload({ contacts }));
    expect(result.ok).toBe(false);
  });

  it('accepts exactly 5 contacts', () => {
    const contacts = Array.from({ length: 5 }, (_, i) => ({ name: `C${i}`, channel: 'telegram', address: `${i}` }));
    const result = validateSettings(validPayload({ contacts }));
    expect(result.ok).toBe(true);
  });

  it('rejects a bad contact channel', () => {
    const result = validateSettings(validPayload({ contacts: [{ name: 'Sarah', channel: 'sms', address: '123' }] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a contact missing a name', () => {
    const result = validateSettings(validPayload({ contacts: [{ channel: 'telegram', address: '123' }] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a contact missing an address', () => {
    const result = validateSettings(validPayload({ contacts: [{ name: 'Sarah', channel: 'telegram' }] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a non-object contact entry', () => {
    const result = validateSettings(validPayload({ contacts: ['nope'] }));
    expect(result.ok).toBe(false);
  });

  describe('model', () => {
    it('accepts and round-trips a curated model id', () => {
      const result = validateSettings(validPayload({ model: 'gemini-3-pro-preview' }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.model).toBe('gemini-3-pro-preview');
    });

    it("accepts '' to mean use the env/default chain", () => {
      const result = validateSettings(validPayload({ model: '' }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.model).toBe('');
    });

    it('defaults to the env primary/default chain when omitted', () => {
      const result = validateSettings(validPayload());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.model).toBe('');
    });

    it('rejects a model id outside the curated list', () => {
      const result = validateSettings(validPayload({ model: 'not-a-real-model' }));
      expect(result.ok).toBe(false);
    });

    it('rejects a non-string model', () => {
      const result = validateSettings(validPayload({ model: 42 }));
      expect(result.ok).toBe(false);
    });
  });

  describe('voices', () => {
    it('accepts and round-trips custom voice ids', () => {
      const result = validateSettings(validPayload({ voices: { grandma: 'voice-a', guardian: 'voice-b' } }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.voices).toEqual({ grandma: 'voice-a', guardian: 'voice-b' });
    });

    it('defaults to env/default (empty strings) when omitted', () => {
      const result = validateSettings(validPayload());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.voices).toEqual({ grandma: '', guardian: '' });
    });

    it('rejects a non-object voices field', () => {
      const result = validateSettings(validPayload({ voices: 'nope' }));
      expect(result.ok).toBe(false);
    });

    it('rejects a non-string voices.grandma', () => {
      const result = validateSettings(validPayload({ voices: { grandma: 1, guardian: '' } }));
      expect(result.ok).toBe(false);
    });

    it('rejects voices.guardian over 64 characters', () => {
      const result = validateSettings(validPayload({ voices: { grandma: '', guardian: 'x'.repeat(65) } }));
      expect(result.ok).toBe(false);
    });

    it('accepts voices.grandma at exactly 64 characters', () => {
      const result = validateSettings(validPayload({ voices: { grandma: 'x'.repeat(64), guardian: '' } }));
      expect(result.ok).toBe(true);
    });
  });

  describe('sensitivity', () => {
    it.each(['relaxed', 'balanced', 'paranoid'] as const)('accepts %s', (sensitivity) => {
      const result = validateSettings(validPayload({ sensitivity }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.sensitivity).toBe(sensitivity);
    });

    it('defaults to balanced when omitted', () => {
      const result = validateSettings(validPayload());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.sensitivity).toBe('balanced');
    });

    it('rejects an invalid sensitivity value', () => {
      const result = validateSettings(validPayload({ sensitivity: 'extreme' }));
      expect(result.ok).toBe(false);
    });
  });

  describe('persona', () => {
    function validPersona(overrides: Record<string, unknown> = {}) {
      return { name: 'Gigi', age: 82, city: 'Halifax', grandkid: 'Max', quirks: 'baking bread', ...overrides };
    }

    it('accepts and round-trips a full persona', () => {
      const result = validateSettings(validPayload({ persona: validPersona() }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.persona).toEqual(validPersona());
    });

    it('defaults to the Rose persona when omitted', () => {
      const result = validateSettings(validPayload());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.settings.persona).toEqual({
          name: 'Rose',
          age: 78,
          city: 'Ottawa',
          grandkid: 'Tyler',
          quirks: 'gardening, a cat named Muffin, an old flip phone',
        });
      }
    });

    it('trims persona string fields', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ name: '  Gigi  ' }) }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.persona.name).toBe('Gigi');
    });

    it('rejects a non-object persona', () => {
      const result = validateSettings(validPayload({ persona: 'nope' }));
      expect(result.ok).toBe(false);
    });

    it('rejects an empty persona.name', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ name: '   ' }) }));
      expect(result.ok).toBe(false);
    });

    it('rejects persona.name over 40 characters', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ name: 'a'.repeat(41) }) }));
      expect(result.ok).toBe(false);
    });

    it('rejects an empty persona.city', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ city: '' }) }));
      expect(result.ok).toBe(false);
    });

    it('rejects persona.city over 40 characters', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ city: 'b'.repeat(41) }) }));
      expect(result.ok).toBe(false);
    });

    it('rejects an empty persona.grandkid', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ grandkid: '' }) }));
      expect(result.ok).toBe(false);
    });

    it('rejects persona.grandkid over 40 characters', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ grandkid: 'c'.repeat(41) }) }));
      expect(result.ok).toBe(false);
    });

    it('rejects an empty persona.quirks', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ quirks: '' }) }));
      expect(result.ok).toBe(false);
    });

    it('rejects persona.quirks over 200 characters', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ quirks: 'd'.repeat(201) }) }));
      expect(result.ok).toBe(false);
    });

    it('accepts persona.quirks at exactly 200 characters', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ quirks: 'd'.repeat(200) }) }));
      expect(result.ok).toBe(true);
    });

    it('rejects a non-integer persona.age', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ age: 78.5 }) }));
      expect(result.ok).toBe(false);
    });

    it('rejects persona.age below 1', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ age: 0 }) }));
      expect(result.ok).toBe(false);
    });

    it('rejects persona.age above 120', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ age: 121 }) }));
      expect(result.ok).toBe(false);
    });

    it('accepts persona.age at the boundaries (1 and 120)', () => {
      expect(validateSettings(validPayload({ persona: validPersona({ age: 1 }) })).ok).toBe(true);
      expect(validateSettings(validPayload({ persona: validPersona({ age: 120 }) })).ok).toBe(true);
    });

    it('rejects a non-number persona.age', () => {
      const result = validateSettings(validPayload({ persona: validPersona({ age: '78' }) }));
      expect(result.ok).toBe(false);
    });
  });
});

describe('createSettingsManager', () => {
  it('starts with defaults and updates in memory on set()', () => {
    const manager = createSettingsManager(createInMemoryStore());
    expect(manager.get()).toEqual(defaultSettings());

    const next: Settings = fullSettings({ protectedName: 'Grandma Rose', notifyOn: 'coach' });
    manager.set(next);
    expect(manager.get()).toEqual(next);
  });

  it('mirrors writes through to a store that implements saveSettings', () => {
    const store = concreteStore();
    const saveSpy = vi.spyOn(store, 'saveSettings');
    const manager = createSettingsManager(store);
    const next: Settings = fullSettings({ notifyOn: 'coach' });
    manager.set(next);
    expect(saveSpy).toHaveBeenCalledWith(next);
  });

  it('never throws when the store saveSettings throws', () => {
    const store = concreteStore();
    vi.spyOn(store, 'saveSettings').mockImplementation(() => {
      throw new Error('store down');
    });
    const manager = createSettingsManager(store);
    expect(() => manager.set(fullSettings())).not.toThrow();
  });

  it('works with a store that has no settings persistence at all', () => {
    const bareStore = {
      saveSessionStart: () => {},
      saveSessionEnd: () => {},
      saveEvent: () => {},
      getLeaderboard: async () => [],
    };
    const manager = createSettingsManager(bareStore);
    expect(manager.get()).toEqual(defaultSettings());
    expect(() => manager.set(fullSettings())).not.toThrow();
  });

  it('hydrates asynchronously from the store when settings were previously saved', async () => {
    const store = concreteStore();
    const saved: Settings = fullSettings({ protectedName: 'Nana', notifyOn: 'coach' });
    store.saveSettings(saved);
    const manager = createSettingsManager(store);
    await new Promise((resolve) => setImmediate(resolve));
    expect(manager.get()).toEqual(saved);
  });

  it('keeps defaults when the store hydrate rejects', async () => {
    const store = concreteStore();
    vi.spyOn(store, 'getSettings').mockRejectedValue(new Error('boom'));
    const manager = createSettingsManager(store);
    await new Promise((resolve) => setImmediate(resolve));
    expect(manager.get()).toEqual(defaultSettings());
  });
});
