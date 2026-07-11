import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { curatedModelIds, gemini, geminiEnabled, listModels } from './gemini.js';

const originalFetch = global.fetch;

describe('geminiEnabled', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it('is false when no key is set', () => {
    delete process.env.GEMINI_API_KEY;
    expect(geminiEnabled()).toBe(false);
  });

  it('is true when a key is set', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    expect(geminiEnabled()).toBe(true);
  });
});

describe('gemini', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    global.fetch = originalFetch;
  });

  it('throws if no api key is set', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(gemini('system', [])).rejects.toThrow('GEMINI_API_KEY not set');
  });

  it('returns the response text on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'hello there' }] } }] }),
    }) as unknown as typeof fetch;
    const result = await gemini('system', [{ role: 'user', text: 'hi' }]);
    expect(result).toBe('hello there');
  });

  it('throws when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    }) as unknown as typeof fetch;
    await expect(gemini('system', [])).rejects.toThrow('Gemini request failed with 500');
  });

  it('throws when the response has no text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    }) as unknown as typeof fetch;
    await expect(gemini('system', [])).rejects.toThrow('All Gemini keys/models exhausted');
  });

  it('tries preferredModel first, before the env primary/fallback chain', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await gemini('system', [], { preferredModel: 'gemini-3-pro-preview' });

    const firstUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstUrl).toContain('models/gemini-3-pro-preview:generateContent');
  });

  it('falls through to the next model in the chain when preferredModel 404s', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'fallback reply' }] } }] }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gemini('system', [], { preferredModel: 'gemini-3-pro-preview' });
    expect(result).toBe('fallback reply');
    expect(fetchMock.mock.calls[0][0]).toContain('gemini-3-pro-preview');
    expect(fetchMock.mock.calls[1][0]).not.toContain('gemini-3-pro-preview');
  });

  it('does not duplicate preferredModel when it already equals the env primary', async () => {
    process.env.GEMINI_MODEL = 'gemini-3-flash-preview';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await gemini('system', [], { preferredModel: 'gemini-3-flash-preview' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    delete process.env.GEMINI_MODEL;
  });
});

describe('listModels', () => {
  afterEach(() => {
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_FALLBACK_MODELS;
  });

  it('reports the env primary as active and source "primary" when no model is selected', () => {
    const { active, models } = listModels();
    expect(active).toBe('gemini-3-flash-preview');
    const primary = models.find((m) => m.id === 'gemini-3-flash-preview');
    expect(primary?.source).toBe('primary');
  });

  it('includes the curated extras (deduped) alongside the env chain', () => {
    const { models } = listModels();
    const ids = models.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids).toContain('gemini-3-pro-preview');
    expect(ids).toContain('gemini-flash-lite-latest');
  });

  it('reports a selected model as active with source "selected", even if it also matches the primary', () => {
    const { active, models } = listModels('gemini-3-pro-preview');
    expect(active).toBe('gemini-3-pro-preview');
    const selected = models.find((m) => m.id === 'gemini-3-pro-preview');
    expect(selected?.source).toBe('selected');
  });

  it('gives every model a human-readable label', () => {
    const { models } = listModels();
    const flash = models.find((m) => m.id === 'gemini-3-flash-preview');
    expect(flash?.label).toBe('Gemini 3 Flash Preview');
  });

  it('respects env overrides for primary/fallback models', () => {
    process.env.GEMINI_MODEL = 'custom-primary';
    process.env.GEMINI_FALLBACK_MODELS = 'custom-fallback';
    const { active, models } = listModels();
    expect(active).toBe('custom-primary');
    const ids = models.map((m) => m.id);
    expect(ids).toContain('custom-primary');
    expect(ids).toContain('custom-fallback');
  });
});

describe('curatedModelIds', () => {
  it('matches the ids in listModels()', () => {
    expect(curatedModelIds()).toEqual(listModels().models.map((m) => m.id));
  });

  it("does not include '' (the 'use env/default chain' sentinel is validated separately)", () => {
    expect(curatedModelIds()).not.toContain('');
  });
});
