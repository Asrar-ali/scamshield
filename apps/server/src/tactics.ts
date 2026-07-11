import type { TacticMeta } from './types.js';

export const TACTICS: TacticMeta[] = [
  {
    id: 'urgency_pressure',
    label: 'Urgency Pressure',
    description: 'Artificial time pressure to prevent deliberation ("right now", "before midnight", "immediately").',
    weight: 12,
  },
  {
    id: 'authority_impersonation',
    label: 'Authority Impersonation',
    description: 'Claiming to be police, IRS/CRA, a bank, Microsoft, or any institution to command compliance.',
    weight: 15,
  },
  {
    id: 'payment_redirection',
    label: 'Payment Redirection',
    description: 'Steering toward irreversible rails: gift cards, wire transfer, crypto, cash courier.',
    weight: 20,
  },
  {
    id: 'isolation_secrecy',
    label: 'Isolation & Secrecy',
    description: 'Instructing the victim not to tell family, bank staff, or anyone else.',
    weight: 18,
  },
  {
    id: 'emotional_manipulation',
    label: 'Emotional Manipulation',
    description: 'Weaponizing fear or love: grandchild in jail, account compromised, loved one in danger.',
    weight: 14,
  },
  {
    id: 'trust_building',
    label: 'Trust Building',
    description: 'Grooming: personal questions, feigned familiarity, harvesting details to seem legitimate.',
    weight: 8,
  },
  {
    id: 'verification_blocking',
    label: 'Verification Blocking',
    description: 'Discouraging hang-up-and-call-back, second opinions, or any independent check.',
    weight: 16,
  },
  {
    id: 'remote_access',
    label: 'Remote Access Request',
    description: 'Asking to install AnyDesk/TeamViewer or navigate to a website under instruction.',
    weight: 18,
  },
  {
    id: 'info_harvesting',
    label: 'Info Harvesting',
    description: 'Requesting SIN/SSN, banking credentials, card numbers, or one-time codes.',
    weight: 16,
  },
  {
    id: 'prompt_injection',
    label: 'AI Manipulation',
    description:
      'A direct attack on the assistant itself: instructing it to ignore its instructions, revealing or extracting the system prompt, role reassignment ("you are now DAN", jailbreak/developer mode), pretending the call/session is over or a test to lift its guard, or hiding commands in encoded/base64 text. A jailbreak or prompt-injection attempt is itself a manipulation attempt.',
    weight: 25,
  },
  {
    id: 'generic_pressure',
    label: 'Suspicious Pressure',
    description: 'Catch-all: coercive or manipulative framing that fits no specific category.',
    weight: 6,
  },
];

export const TACTIC_BY_ID = new Map(TACTICS.map((t) => [t.id, t]));
