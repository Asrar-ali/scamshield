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

export type Role = 'scammer' | 'guardian';

/** Delivery channel for alert contacts. Shared by settings contacts and delivery receipts. */
export type DeliveryChannel = 'discord' | 'imessage';

export type FlagAction = 'deleted' | 'warned' | 'muted' | 'reported';

export type Event =
  | { type: 'utterance'; role: Role; text: string; ts: number; userId?: string; avatar?: string }
  | { type: 'tactic'; tactic: TacticId; confidence: number; evidence: string; ts: number; userId?: string }
  | { type: 'risk'; score: number; ts: number; userId?: string }
  | { type: 'intervention'; level: 'flag'; text: string; ts: number; userId?: string }
  | { type: 'action'; action: FlagAction; userId: string; detail?: string; ts: number }
  | {
      type: 'session';
      state: 'start' | 'end';
      id: string;
      ts: number;
      /** Caller alias (the Discord member's username). */
      alias?: string;
      /** Discord user id behind a monitored session, if any. */
      userId?: string;
      avatar?: string;
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

/** Risk-score cutoff for the active sensitivity level. Read-only — server-computed. */
export const RISK_FLAG_THRESHOLD = 50 as const;
