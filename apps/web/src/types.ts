// Mirror of apps/server/src/types.ts — keep in sync by hand (single source: server).
export type TacticId =
  | 'urgency_pressure'
  | 'authority_impersonation'
  | 'payment_redirection'
  | 'isolation_secrecy'
  | 'emotional_manipulation'
  | 'trust_building'
  | 'verification_blocking'
  | 'remote_access'
  | 'info_harvesting'
  | 'prompt_injection'
  | 'generic_pressure';

export type Role = 'scammer' | 'grandma' | 'guardian';

/** Delivery channel for family-contact alerts. Shared by settings contacts and delivery receipts. */
export type DeliveryChannel = 'telegram' | 'imessage';

export type Event =
  | { type: 'utterance'; role: Role; text: string; ts: number }
  | { type: 'tactic'; tactic: TacticId; confidence: number; evidence: string; ts: number }
  | { type: 'risk'; score: number; ts: number }
  | { type: 'intervention'; level: 'coach' | 'takeover' | 'alert'; text: string; ts: number }
  | {
      type: 'session';
      state: 'start' | 'end';
      id: string;
      ts: number;
      /** Which surface originated the session. Absent/undefined means the dashboard (legacy default). */
      channel?: 'dashboard' | 'telegram';
      /** Caller alias — populated for telegram-originated sessions so the dashboard can mirror it. */
      alias?: string;
    }
  | { type: 'delivery'; contact: string; channel: DeliveryChannel; ok: boolean; ts: number };

export const TACTIC_LABELS: Record<TacticId, string> = {
  urgency_pressure: 'Urgency Pressure',
  authority_impersonation: 'Authority Impersonation',
  payment_redirection: 'Payment Redirection',
  isolation_secrecy: 'Isolation & Secrecy',
  emotional_manipulation: 'Emotional Manipulation',
  trust_building: 'Trust Building',
  verification_blocking: 'Verification Blocking',
  remote_access: 'Remote Access Request',
  info_harvesting: 'Info Harvesting',
  prompt_injection: 'AI Manipulation',
  generic_pressure: 'Suspicious Pressure',
};

/** A distinct hue per tactic, shared across the tactics rail, timeline markers,
 * and the threat-intel bars so a tactic reads as the same color everywhere.
 * Mirrors the map in components/TacticsPanel.tsx. */
export const TACTIC_HUE: Record<TacticId, string> = {
  urgency_pressure: '#ffb020',
  authority_impersonation: '#a78bfa',
  payment_redirection: '#f472b6',
  isolation_secrecy: '#60a5fa',
  emotional_manipulation: '#fb7185',
  trust_building: '#34d399',
  verification_blocking: '#f59e0b',
  remote_access: '#22d3ee',
  info_harvesting: '#c084fc',
  prompt_injection: '#f43f5e',
  generic_pressure: '#94a3b8',
};

/** Risk-score cutoffs mirrored from apps/server/src/risk.ts and RiskGauge —
 * the coach and takeover intervention thresholds. */
export const RISK_THRESHOLDS = { coach: 45, takeover: 80 } as const;
