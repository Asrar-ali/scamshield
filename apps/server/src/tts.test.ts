import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { synthesizeSpeech, ttsEnabled, voiceIdFor } from './tts.js';

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
});
