const DEFAULT_ALIAS = 'Anonymous Scammer';
const MAX_ALIAS_LENGTH = 24;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

export function sanitizeAlias(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_ALIAS;
  const cleaned = raw.replace(CONTROL_CHARS, '').trim().slice(0, MAX_ALIAS_LENGTH).trim();
  return cleaned.length > 0 ? cleaned : DEFAULT_ALIAS;
}
