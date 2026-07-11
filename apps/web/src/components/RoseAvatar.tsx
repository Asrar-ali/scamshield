interface RoseAvatarProps {
  /** Larger, ringing treatment for the idle incoming-call card. */
  size?: number;
  /** Pulsing "incoming call" rings (idle landing). */
  ringing?: boolean;
  /** Voicing a line — animate the ring + show it's her turn. */
  speaking?: boolean;
}

/**
 * A warm, abstract-but-friendly vector portrait of Rose — silver hair bun,
 * round glasses, a knitted-cardigan collar. Pure SVG, no photos. The wrapper
 * carries the ringing / speaking animation state via CSS.
 */
export function RoseAvatar({ size = 56, ringing = false, speaking = false }: RoseAvatarProps) {
  const cls = ['rose-avatar', ringing ? 'is-ringing' : '', speaking ? 'is-speaking' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} style={{ width: size, height: size }}>
      <span className="rose-ring" aria-hidden="true" />
      <span className="rose-ring rose-ring-2" aria-hidden="true" />
      <svg viewBox="0 0 100 100" className="rose-face" role="img" aria-label="Rose">
        <defs>
          <radialGradient id="rose-bg" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#123024" />
            <stop offset="100%" stopColor="#0c1f18" />
          </radialGradient>
          <linearGradient id="rose-cardigan" x1="0" y1="70" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7c9c86" />
            <stop offset="1" stopColor="#5f8f74" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="49" fill="url(#rose-bg)" />
        {/* cardigan collar */}
        <path d="M20 100 Q26 74 50 74 Q74 74 80 100 Z" fill="url(#rose-cardigan)" />
        <path d="M44 76 L50 88 L56 76" fill="none" stroke="#eaf3ee" strokeWidth="2.4" strokeLinecap="round" />
        {/* silver hair */}
        <path d="M27 50 Q24 22 50 22 Q76 22 73 50 Q73 40 63 36 Q56 46 37 40 Q29 42 27 50Z" fill="#d9dee6" />
        <circle cx="50" cy="17" r="8" fill="#d9dee6" />
        {/* face */}
        <path d="M32 48 Q32 74 50 74 Q68 74 68 48 Q68 34 50 34 Q32 34 32 48Z" fill="#f2c9a8" />
        {/* cheeks */}
        <circle cx="39" cy="57" r="4" fill="#eaa989" opacity="0.55" />
        <circle cx="61" cy="57" r="4" fill="#eaa989" opacity="0.55" />
        {/* glasses */}
        <g stroke="#3c4a55" strokeWidth="2" fill="rgba(255,255,255,0.14)">
          <circle cx="41" cy="50" r="7" />
          <circle cx="59" cy="50" r="7" />
        </g>
        <path d="M48 50 h4M34 49 l-4-2M66 49 l4-2" stroke="#3c4a55" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* eyes + smile */}
        <circle cx="41" cy="50" r="2.1" fill="#374151" />
        <circle cx="59" cy="50" r="2.1" fill="#374151" />
        <path className="rose-mouth" d="M43 63 Q50 69 57 63" fill="none" stroke="#b0654f" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
