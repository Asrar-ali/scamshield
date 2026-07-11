import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gemini, geminiEnabled } from './gemini.js';

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
});
