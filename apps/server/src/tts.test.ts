import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listVoices, resetVoicesCache, synthesizeSpeech, ttsEnabled, voiceIdFor } from './tts.js';

const originalFetch = global.fetch;

describe('ttsEnabled', () => {
  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
  });

  it('is false when no key is set', () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(ttsEnabled()).toBe(false);
  });

  it('is true when a key is set', () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    expect(ttsEnabled()).toBe(true);
  });
});

describe('voiceIdFor', () => {
  afterEach(() => {
    delete process.env.ELEVENLABS_VOICE_GRANDMA;
    delete process.env.ELEVENLABS_VOICE_GUARDIAN;
  });

  it('uses the documented default when no override is set', () => {
    delete process.env.ELEVENLABS_VOICE_GRANDMA;
    delete process.env.ELEVENLABS_VOICE_GUARDIAN;
    expect(voiceIdFor('grandma')).toBeTruthy();
    expect(voiceIdFor('guardian')).toBeTruthy();
    expect(voiceIdFor('grandma')).not.toBe(voiceIdFor('guardian'));
  });

  it('respects env var overrides per role', () => {
    process.env.ELEVENLABS_VOICE_GRANDMA = 'grandma-voice';
    process.env.ELEVENLABS_VOICE_GUARDIAN = 'guardian-voice';
    expect(voiceIdFor('grandma')).toBe('grandma-voice');
    expect(voiceIdFor('guardian')).toBe('guardian-voice');
  });
});

describe('synthesizeSpeech', () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
    global.fetch = originalFetch;
  });

  it('throws if no api key is set', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    await expect(synthesizeSpeech('hello', 'grandma')).rejects.toThrow('ELEVENLABS_API_KEY not set');
  });

  it('returns audio bytes on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('audio-bytes').buffer,
    }) as unknown as typeof fetch;
    const buf = await synthesizeSpeech('hello', 'grandma');
    expect(buf.toString()).toBe('audio-bytes');
  });

  it('throws when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    }) as unknown as typeof fetch;
    await expect(synthesizeSpeech('hello', 'guardian')).rejects.toThrow('ElevenLabs 401');
  });

  it('uses opts.voiceId instead of the role default when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('audio-bytes').buffer,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await synthesizeSpeech('hello', 'grandma', { voiceId: 'custom-voice-id' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('custom-voice-id');
    expect(url).not.toContain(voiceIdFor('grandma'));
  });

  it('falls back to voiceIdFor(role) when opts.voiceId is empty/absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('audio-bytes').buffer,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await synthesizeSpeech('hello', 'guardian', { voiceId: '' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(voiceIdFor('guardian'));
  });
});

describe('listVoices', () => {
  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
    global.fetch = originalFetch;
    resetVoicesCache();
  });

  it('returns [] when keyless', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(await listVoices()).toEqual([]);
  });

  it('maps ElevenLabs voices to {id, name} and caches the result across calls', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        voices: [
          { voice_id: 'v1', name: 'Rachel' },
          { voice_id: 'v2', name: 'Antoni' },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = await listVoices();
    expect(first).toEqual([
      { id: 'v1', name: 'Rachel' },
      { id: 'v2', name: 'Antoni' },
    ]);

    const second = await listVoices();
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the xi-api-key header', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ voices: [] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await listVoices();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.elevenlabs.io/v1/voices');
    expect((fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers['xi-api-key']).toBe('test-key');
  });

  it('returns [] (does not throw) when the ElevenLabs request fails', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    expect(await listVoices()).toEqual([]);
  });

  it('returns [] (does not throw) when fetch rejects', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    await expect(listVoices()).resolves.toEqual([]);
  });
});
