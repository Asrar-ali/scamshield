export type VoiceRole = 'grandma' | 'guardian';

// Default ElevenLabs premade voice IDs (Rachel, Antoni) — overridable via env.
const DEFAULT_VOICE_GRANDMA = '21m00Tcm4TlvDq8ikWAM';
const DEFAULT_VOICE_GUARDIAN = 'ErXwobaYiN019PkySvjV';

export function ttsEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export function voiceIdFor(role: VoiceRole): string {
  if (role === 'grandma') return process.env.ELEVENLABS_VOICE_GRANDMA ?? DEFAULT_VOICE_GRANDMA;
  return process.env.ELEVENLABS_VOICE_GUARDIAN ?? DEFAULT_VOICE_GUARDIAN;
}

export async function synthesizeSpeech(text: string, role: VoiceRole): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY not set');

  const voiceId = voiceIdFor(role);
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
