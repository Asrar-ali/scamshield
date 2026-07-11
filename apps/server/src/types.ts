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

export type Event =
  | { type: 'utterance'; role: Role; text: string; ts: number }
  | { type: 'tactic'; tactic: TacticId; confidence: number; evidence: string; ts: number }
  | { type: 'risk'; score: number; ts: number }
  | { type: 'intervention'; level: 'coach' | 'takeover' | 'alert'; text: string; ts: number }
  | { type: 'session'; state: 'start' | 'end'; id: string; ts: number };

export interface TacticMeta {
  id: TacticId;
  label: string;
  description: string;
  weight: number;
}

export interface Detection {
  tactic: TacticId;
  confidence: number;
  evidence: string;
}
