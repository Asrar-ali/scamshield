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

/** createInMemoryStore always implements the optional settings hooks concretely. */
function concreteStore(): Store & { saveSettings: NonNullable<Store['saveSettings']>; getSettings: NonNullable<Store['getSettings']> } {
  return createInMemoryStore() as ReturnType<typeof concreteStore>;
}

describe('defaultSettings', () => {
  it('defaults to Rose, takeover-only, no contacts', () => {
    expect(defaultSettings()).toEqual({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [] });
  });

  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = defaultSettings();
    const b = defaultSettings();
    a.contacts.push({ id: 'x', name: 'x', channel: 'telegram', address: 'x' });
    expect(b.contacts).toEqual([]);
  });
});

describe('validateSettings', () => {
  it('accepts a minimal valid payload', () => {
    const result = validateSettings(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings).toEqual({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [] });
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
});

describe('createSettingsManager', () => {
  it('starts with defaults and updates in memory on set()', () => {
    const manager = createSettingsManager(createInMemoryStore());
    expect(manager.get()).toEqual(defaultSettings());

    const next: Settings = { protectedName: 'Grandma Rose', notifyOn: 'coach', contacts: [] };
    manager.set(next);
    expect(manager.get()).toEqual(next);
  });

  it('mirrors writes through to a store that implements saveSettings', () => {
    const store = concreteStore();
    const saveSpy = vi.spyOn(store, 'saveSettings');
    const manager = createSettingsManager(store);
    const next: Settings = { protectedName: 'Rose', notifyOn: 'coach', contacts: [] };
    manager.set(next);
    expect(saveSpy).toHaveBeenCalledWith(next);
  });

  it('never throws when the store saveSettings throws', () => {
    const store = concreteStore();
    vi.spyOn(store, 'saveSettings').mockImplementation(() => {
      throw new Error('store down');
    });
    const manager = createSettingsManager(store);
    expect(() => manager.set({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [] })).not.toThrow();
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
    expect(() => manager.set({ protectedName: 'Rose', notifyOn: 'takeover', contacts: [] })).not.toThrow();
  });

  it('hydrates asynchronously from the store when settings were previously saved', async () => {
    const store = concreteStore();
    const saved: Settings = { protectedName: 'Nana', notifyOn: 'coach', contacts: [] };
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
