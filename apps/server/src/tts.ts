import { log } from './log.js';

export type VoiceRole = 'grandma' | 'guardian';

// Default ElevenLabs premade voice IDs (Rachel, Antoni) — overridable via env.
const DEFAULT_VOICE_GRANDMA = '21m00Tcm4TlvDq8ikWAM';
const DEFAULT_VOICE_GUARDIAN = 'ErXwobaYiN019PkySvjV';
const VOICES_CACHE_MS = 10 * 60 * 1000;

export function ttsEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export function voiceIdFor(role: VoiceRole): string {
  if (role === 'grandma') return process.env.ELEVENLABS_VOICE_GRANDMA ?? DEFAULT_VOICE_GRANDMA;
  return process.env.ELEVENLABS_VOICE_GUARDIAN ?? DEFAULT_VOICE_GUARDIAN;
}

export interface SynthesizeOptions {
  /** Overrides the role's default/env voice id when set and non-empty. */
  voiceId?: string;
}

export async function synthesizeSpeech(text: string, role: VoiceRole, opts: SynthesizeOptions = {}): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY not set');

  const voiceId = opts.voiceId || voiceIdFor(role);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5' }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface ElevenLabsVoice {
  id: string;
  name: string;
}

let voicesCache: { at: number; voices: ElevenLabsVoice[] } | null = null;

/** Test-only: clears the in-memory /v1/voices cache so tests don't leak state across cases. */
export function resetVoicesCache(): void {
  voicesCache = null;
}

/**
 * Proxies ElevenLabs GET /v1/voices reduced to {id, name}, cached in memory for
 * 10 minutes. Never throws: returns [] when keyless or on any fetch/parse error,
 * same graceful-degradation pattern as the rest of this module.
 */
export async function listVoices(): Promise<ElevenLabsVoice[]> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return [];

  const now = Date.now();
  if (voicesCache && now - voicesCache.at < VOICES_CACHE_MS) return voicesCache.voices;

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
    if (!res.ok) return [];
    const data = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
    const voices = (data.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name }));
    voicesCache = { at: now, voices };
    return voices;
  } catch (err) {
    log.warn('ElevenLabs listVoices failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
