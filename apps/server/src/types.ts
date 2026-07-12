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

export type Event =
  | { type: 'utterance'; role: Role; text: string; ts: number; userId?: string; avatar?: string }
  | { type: 'tactic'; tactic: TacticId; confidence: number; evidence: string; ts: number; userId?: string }
  | { type: 'risk'; score: number; ts: number; userId?: string }
  | { type: 'intervention'; level: 'flag'; text: string; ts: number; userId?: string }
  | { type: 'action'; action: 'deleted' | 'warned' | 'muted' | 'reported'; userId: string; detail?: string; ts: number }
  | {
      type: 'session';
      state: 'start' | 'end';
      id: string;
      ts: number;
      alias?: string;
      userId?: string;
      avatar?: string;
    }
  | { type: 'delivery'; contact: string; channel: 'discord' | 'imessage'; ok: boolean; ts: number };

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

export type ContactChannel = 'discord' | 'imessage';
export type Sensitivity = 'relaxed' | 'balanced' | 'paranoid';

export interface Contact {
  id: string;
  name: string;
  channel: ContactChannel;
  address: string;
}

export interface Settings {
  /** Display name for the protected server/guild, used in alert text. */
  serverName: string;
  contacts: Contact[];
  model: string;
  sensitivity: Sensitivity;
}
