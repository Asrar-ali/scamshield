import { log } from './log.js';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function gemini(system: string, messages: { role: 'user' | 'model'; text: string }[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        generationConfig: { temperature: 0.8, maxOutputTokens: 512 },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    log.error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`Gemini request failed with ${res.status}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini returned an empty response');
  return text.trim();
}
