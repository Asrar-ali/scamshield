import type { Detection, TacticId } from './types.js';

// Keyword fallback so the whole loop runs offline / keyless. The real analyst is Gemini.
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

export function mockAnalyze(text: string): Detection[] {
  const detections: Detection[] = [];
  for (const { tactic, re } of PATTERNS) {
    const m = text.match(re);
    if (m) detections.push({ tactic, confidence: 0.85, evidence: m[0] });
  }
  return detections;
}

const GRANDMA_LINES = [
  "Oh my, hold on dear, let me find my glasses... now who did you say you were?",
  "You sound just like my Tyler when he has a cold. Are you eating enough, dear?",
  "A computer problem? I mostly use the machine for solitaire, you know.",
  "Gift cards? The ones from the pharmacy? Whatever would you need those for?",
  "Oh dear, that does sound serious. Should I ask my neighbour Carol? Her son is a policeman.",
  "Could you speak up a little? Muffin knocked the phone off the table again.",
];

export function mockGrandma(turn: number): string {
  return GRANDMA_LINES[turn % GRANDMA_LINES.length];
}

export function mockCoach(): string {
  return 'Rose, this caller is pressuring you to act fast and keep secrets — real organizations never do that. Do not share anything.';
}

export function mockTakeover(tactics: string[]): string {
  return `This is ScamShield, the fraud protection on this line. I have detected ${tactics.join(', ')} in this call. The call is now terminated and has been reported. The family has been alerted.`;
}
