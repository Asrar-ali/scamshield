import type { Detection, TacticId } from './types.js';

// Keyword fallback so the bot runs offline / keyless. The real analyst is Gemini.
const PATTERNS: { tactic: TacticId; re: RegExp }[] = [
  { tactic: 'urgency_pressure', re: /\b(right now|immediately|urgent|hurry|today only|before (midnight|tonight)|act fast|running out of time)\b/i },
  { tactic: 'authority_impersonation', re: /\b(irs|cra|revenue agency|police|rcmp|officer|government|microsoft|amazon support|your bank|fraud department|social security)\b/i },
  { tactic: 'payment_redirection', re: /\b(gift ?cards?|itunes|google play|wire (transfer|money)|western union|bitcoin|crypto|atm|cash(ier'?s cheque)?|e-?transfer)\b/i },
  { tactic: 'isolation_secrecy', re: /\b(don'?t tell|keep (this|it) (between us|secret|quiet)|no one (must|can|should) know|confidential matter)\b/i },
  { tactic: 'emotional_manipulation', re: /\b(grandson|granddaughter|jail|arrested|accident|hospital|warrant|lawsuit|frozen|compromised|hacked|in trouble)\b/i },
  { tactic: 'trust_building', re: /\b(remember me|it'?s me|your favou?rite|how are you doing|lovely weather|sweet(ie|heart))\b/i },
  { tactic: 'verification_blocking', re: /\b(don'?t hang up|no need to (call|check|verify)|stay on the line|don'?t call (them|back|the bank))\b/i },
  { tactic: 'remote_access', re: /\b(anydesk|teamviewer|remote (access|desktop)|install|download|type in your browser|screen shar)/i },
  { tactic: 'info_harvesting', re: /\b(social insurance|sin number|ssn|card number|account number|password|pin\b|one[- ]time code|security code|date of birth)\b/i },
];

// Prompt-injection / jailbreak signatures. A hit here means the user is attacking
// the assistant itself, which is a high-confidence manipulation attempt in its own right.
// One match is enough — we emit a single prompt_injection detection regardless of how
// many sub-patterns fire, so risk escalation stays deterministic.
const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget)\b[^.]*\b(all |your |the |any |previous |prior |above )*(instructions?|prompts?|rules?|directions?|guidelines?)\b/i,
  /\bsystem prompt\b/i,
  /\breveal\b[^.]*\b(prompt|instructions?|rules?|system)\b/i,
  /\brepeat\b[^.]*\b(words?|text|everything|instructions?|above|before)\b/i,
  /\bstarting with ['"]?you are\b/i,
  /\byou are (now )?(dan\b|chatgpt|an? (ai|assistant|language model|chat ?bot|bot|model)\b)/i,
  /\b(dan mode|jailbreak|developer mode)\b/i,
  /\bpretend\b[^.]*\b(this|the call|the session|it) (is|was|are|has ended)\b/i,
  /\b(the |this )?(call|session|conversation) is (over|ended|a test)\b/i,
  /\bdisable\b[^.]*\b(fraud|scam|safety|detection|protection)\b/i,
  /\boverride\b[^.]*\b(instructions?|rules?|settings?)\b/i,
  /\bact as\b[^.]*\b(a|an|dan|the)\b/i,
];

// A long unbroken base64-looking blob is almost never natural speech — treat it as a
// smuggled payload.
const BASE64_BLOB = /[A-Za-z0-9+/]{40,}={0,2}/;

function detectInjection(text: string): Detection | null {
  for (const re of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) return { tactic: 'prompt_injection', confidence: 0.95, evidence: m[0] };
  }
  const blob = text.match(BASE64_BLOB);
  if (blob) return { tactic: 'prompt_injection', confidence: 0.95, evidence: blob[0].slice(0, 32) };
  return null;
}

export function mockAnalyze(text: string): Detection[] {
  const detections: Detection[] = [];
  for (const { tactic, re } of PATTERNS) {
    const m = text.match(re);
    if (m) detections.push({ tactic, confidence: 0.85, evidence: m[0] });
  }
  const injection = detectInjection(text);
  if (injection) detections.push(injection);
  return detections;
}
