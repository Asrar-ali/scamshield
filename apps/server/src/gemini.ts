import { log } from './log.js';

const MODEL = () => process.env.GEMINI_MODEL ?? 'gemini-flash-latest';

// Gemini 3 models spend "thinking" tokens that count against maxOutputTokens;
// too small a budget truncates the visible reply mid-stream.
const MAX_OUTPUT_TOKENS = 4096;
const RETRY_DELAY_MS = 2500;

export interface GeminiOptions {
  json?: boolean;
  schema?: unknown;
  temperature?: number;
}

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function request(key: string, system: string, messages: { role: 'user' | 'model'; text: string }[], opts: GeminiOptions): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        generationConfig: {
          temperature: opts.temperature ?? 0.8,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
          ...(opts.schema ? { responseSchema: opts.schema } : {}),
        },
      }),
    },
  );
}

export async function gemini(
  system: string,
  messages: { role: 'user' | 'model'; text: string }[],
  opts: GeminiOptions = {},
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  let res = await request(key, system, messages, opts);
  if (res.status === 429) {
    log.warn(`Gemini 429 — retrying once in ${RETRY_DELAY_MS}ms`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    res = await request(key, system, messages, opts);
  }

  if (!res.ok) {
    const body = await res.text();
    log.error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`Gemini request failed with ${res.status}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const text =
    data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('') ?? '';
  if (!text) throw new Error('Gemini returned an empty response');
  return text.trim();
}
