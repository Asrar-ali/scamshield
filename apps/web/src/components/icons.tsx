import type { ReactNode, SVGProps } from 'react';
import type { TacticId } from '../types';

type IconProps = SVGProps<SVGSVGElement>;

/** Shared line-icon frame: 24px grid, rounded strokes, inherits currentColor. */
function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Filled shield used in the wordmark — deliberately solid, not a line icon. */
export function ShieldMark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 2.2 4 5.2v6.1c0 4.9 3.3 8.7 8 10.5 4.7-1.8 8-5.6 8-10.5V5.2l-8-3Z"
        fill="url(#sm-grad)"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={0.8}
      />
      <path d="M8.4 12.1l2.5 2.5 4.7-4.9" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="sm-grad" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b7bff" />
          <stop offset="1" stopColor="#5b8dff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.6 3.5 4 4.2c-1 .3-1.6 1.3-1.3 2.3 1.6 6.3 6.5 11.2 12.8 12.8 1 .3 2-.3 2.3-1.3l.7-2.6c.2-.9-.3-1.8-1.1-2.1l-2.9-1.1c-.7-.3-1.5-.1-2 .5l-.8 1c-2.3-1.1-4.1-2.9-5.2-5.2l1-.8c.6-.5.8-1.3.5-2L7.9 4.6c-.3-.8-1.2-1.3-2.1-1.1Z" />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21M8.5 21h7" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12 20 4.5 14.5 20l-3.2-6.3L4.5 12Z" />
  </Icon>
);

export const WhisperIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 11a5 5 0 0 1 5-5h1.5L14 3v18l-4.5-3H8a5 5 0 0 1-5-5Z" />
    <path d="M18 8.5a5 5 0 0 1 0 7" />
  </Icon>
);

export const SirenIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 19v-6a7 7 0 0 1 14 0v6" />
    <path d="M3.5 19h17M12 3V1.5M20 6l1-1M4 6 3 5" />
  </Icon>
);

export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);

/** Discord game-controller-ish wordmark glyph (filled, uses currentColor). */
export const DiscordIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M19.3 5.3A16.6 16.6 0 0 0 15.1 4l-.2.4a12.7 12.7 0 0 1 3.7 1.2 13.4 13.4 0 0 0-11-.4l-.4.2A12.8 12.8 0 0 1 11 4.4L10.8 4a16.6 16.6 0 0 0-4.2 1.3C3.6 9.7 2.8 14 3.2 18.2A16.7 16.7 0 0 0 8.3 21l.6-1c-.8-.3-1.6-.7-2.3-1.2l.2-.1a11.9 11.9 0 0 0 10.3 0l.2.1c-.7.5-1.5.9-2.3 1.2l.6 1a16.6 16.6 0 0 0 5.1-2.8c.5-4.9-.8-9.2-3.4-12.9ZM9.3 15.6c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm5.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
  </svg>
);

export const MessageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5h16v10.5H9.5L5 20v-4H4Z" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </Icon>
);

export const CrossIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5l14 14M19 5 5 19" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
  </Icon>
);

export const VolumeOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
    <path d="M16 9.5l4 5M20 9.5l-4 5" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.5 5 5v5c0 4.2 2.9 7.4 7 8.8 4.1-1.4 7-4.6 7-8.8V5l-7-2.5Z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
);

/** Per-tactic line icons, keyed by TacticId. */
const TACTIC_ICONS: Record<TacticId, (p: IconProps) => JSX.Element> = {
  urgency_pressure: (p) => (
    <Icon {...p}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </Icon>
  ),
  authority_impersonation: (p) => (
    <Icon {...p}>
      <path d="M12 2.5 5 5v5c0 4.2 2.9 7.4 7 8.8 4.1-1.4 7-4.6 7-8.8V5l-7-2.5Z" />
      <path d="M12 8l1.1 2.3 2.5.3-1.8 1.7.5 2.5L12 13.9 9.7 15l.5-2.5L8.4 10.6l2.5-.3L12 8Z" />
    </Icon>
  ),
  payment_redirection: (p) => (
    <Icon {...p}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M2.5 10h19M6 14.5h4" />
    </Icon>
  ),
  isolation_secrecy: (p) => (
    <Icon {...p}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14v2.5" />
    </Icon>
  ),
  emotional_manipulation: (p) => (
    <Icon {...p}>
      <path d="M12 20.5C6 16.5 3.5 13 3.5 9.5A4 4 0 0 1 12 7.4 4 4 0 0 1 20.5 9.5c0 3.5-2.5 7-8.5 11Z" />
      <path d="M12 7.4 10 12l3 1.5-1.5 3.5" />
    </Icon>
  ),
  trust_building: (p) => (
    <Icon {...p}>
      <path d="M8 12.5 5 9.5l-2.5 2.5 4.5 4.5 2-2M16 11.5l3-3 2.5 2.5-4.5 4.5-2-2" />
      <path d="M10 14.5l1.5 1.5 4-4" />
    </Icon>
  ),
  verification_blocking: (p) => (
    <Icon {...p}>
      <path d="M6.6 3.5 4 4.2c-1 .3-1.6 1.3-1.3 2.3a17 17 0 0 0 4 7M9.5 15.5c2 1.4 4.4 2.4 7 3.1 1 .3 2-.3 2.3-1.3l.7-2.6c.2-.9-.3-1.8-1.1-2.1l-2.9-1.1c-.7-.3-1.5-.1-2 .5" />
      <path d="M3 3l18 18" />
    </Icon>
  ),
  remote_access: (p) => (
    <Icon {...p}>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8 20.5h8M12 16.5v4M8 9l2.5 2L8 13M13 13h3" />
    </Icon>
  ),
  info_harvesting: (p) => (
    <Icon {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16c.6-1.6 1.8-2.4 3-2.4s2.4.8 3 2.4M14.5 10h4M14.5 13.5h3" />
    </Icon>
  ),
  prompt_injection: (p) => (
    <Icon {...p}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7 9l3 3-3 3M12.5 15h4.5" />
    </Icon>
  ),
  generic_pressure: (p) => (
    <Icon {...p}>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </Icon>
  ),
};

export function TacticIcon({ tactic, ...props }: IconProps & { tactic: TacticId }) {
  const Cmp = TACTIC_ICONS[tactic] ?? TACTIC_ICONS.generic_pressure;
  return <Cmp {...props} />;
}
