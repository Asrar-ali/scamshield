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
  generic_pressure: 'Suspicious Pressure',
};
