import { log } from './log.js';

// Free-tier Gemini quotas are per-DAY per-MODEL per-PROJECT, so resilience
// comes from walking both axes: alternate models (separate daily buckets)
// and alternate API keys from different Google accounts (separate projects).
const DEFAULT_MODEL = 'gemini-3-flash-preview';
const DEFAULT_FALLBACK_MODELS = ['gemini-flash-lite-latest'];

// Gemini 3 models spend "thinking" tokens that count against maxOutputTokens;
// too small a budget truncates the visible reply mid-stream.
const MAX_OUTPUT_TOKENS = 4096;
const RETRY_DELAY_MS = 2500;

export interface GeminiOptions {
  json?: boolean;
  schema?: unknown;
  temperature?: number;
}

export type AiStatus = 'live' | 'degraded' | 'unconfigured';

let lastOutcome: 'ok' | 'fail' | null = null;

export function aiStatus(): AiStatus {
  if (!geminiEnabled()) return 'unconfigured';
  if (lastOutcome === 'fail') return 'degraded';
  return 'live';
}

function keys(): string[] {
  const list = [
    process.env.GEMINI_API_KEY ?? '',
    ...(process.env.GEMINI_API_KEYS ?? '').split(','),
  ]
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

function models(): string[] {
  const primary = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS.join(','))
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

export function geminiEnabled(): boolean {
  return keys().length > 0;
}

function request(
  key: string,
  model: string,
  system: string,
  messages: { role: 'user' | 'model'; text: string }[],
  opts: GeminiOptions,
): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
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
  });
}

function extractText(data: {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}): string {
  return (
    data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('') ?? ''
  ).trim();
}

export async function gemini(
  system: string,
  messages: { role: 'user' | 'model'; text: string }[],
  opts: GeminiOptions = {},
): Promise<string> {
  const keyList = keys();
  if (keyList.length === 0) throw new Error('GEMINI_API_KEY not set');

  let retriedOnce = false;
  let lastError = 'no attempts made';

  for (const model of models()) {
    for (const key of keyList) {
      let res = await request(key, model, system, messages, opts);

      if (res.status === 429 && !retriedOnce) {
        retriedOnce = true;
        log.warn(`Gemini 429 on ${model} — retrying once in ${RETRY_DELAY_MS}ms`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        res = await request(key, model, system, messages, opts);
      }

      if (res.status === 429 || res.status === 404) {
        lastError = `Gemini ${res.status} on ${model}`;
        log.warn(`${lastError} — trying next key/model`);
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        log.error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
        lastOutcome = 'fail';
        throw new Error(`Gemini request failed with ${res.status}`);
      }

      const text = extractText(await res.json());
      if (!text) {
        lastError = `empty response from ${model}`;
        log.warn(`Gemini returned empty text on ${model} — trying next key/model`);
        continue;
      }
      lastOutcome = 'ok';
      return text;
    }
  }

  lastOutcome = 'fail';
  throw new Error(`All Gemini keys/models exhausted (${lastError})`);
}
