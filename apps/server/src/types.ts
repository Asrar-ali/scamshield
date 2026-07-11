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

export type Event =
  | { type: 'utterance'; role: Role; text: string; ts: number }
  | { type: 'tactic'; tactic: TacticId; confidence: number; evidence: string; ts: number }
  | { type: 'risk'; score: number; ts: number }
  | { type: 'intervention'; level: 'coach' | 'takeover' | 'alert'; text: string; ts: number }
  | { type: 'session'; state: 'start' | 'end'; id: string; ts: number; channel?: 'dashboard' | 'telegram'; alias?: string }
  | { type: 'delivery'; contact: string; channel: 'telegram' | 'imessage'; ok: boolean; ts: number };

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

export type NotifyOn = 'coach' | 'takeover';
export type ContactChannel = 'telegram' | 'imessage';
export type Sensitivity = 'relaxed' | 'balanced' | 'paranoid';

export interface Contact {
  id: string;
  name: string;
  channel: ContactChannel;
  address: string;
}

export interface VoiceSettings {
  grandma: string;
  guardian: string;
}

export interface PersonaSettings {
  name: string;
  age: number;
  city: string;
  grandkid: string;
  quirks: string;
}

export interface Settings {
  protectedName: string;
  notifyOn: NotifyOn;
  contacts: Contact[];
  model: string;
  voices: VoiceSettings;
  sensitivity: Sensitivity;
  persona: PersonaSettings;
}
