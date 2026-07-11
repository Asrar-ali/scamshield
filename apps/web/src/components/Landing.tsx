import { AliasForm } from './AliasForm';
import { RoseAvatar } from './RoseAvatar';
import { ShieldMark } from './icons';

interface LandingProps {
  busy: boolean;
  onStart: (alias: string) => void;
}

const STATS = [
  { value: '$7.75B', label: 'lost by seniors in 2025 — FBI' },
  { value: '10', label: 'manipulation tactics detected live' },
  { value: '<1s', label: 'from red flag to takeover' },
];

/** Idle landing hero — the pitch, the persona, and the call-to-action. */
export function Landing({ busy, onStart }: LandingProps) {
  return (
    <div className="landing">
      <div className="landing-copy">
        <span className="landing-eyebrow">
          <ShieldMark width={16} height={16} />
          Real-time scam defense
        </span>
        <h1 className="landing-title">
          Think you can scam
          <br />
          an <span className="grad">AI grandma?</span>
        </h1>
        <p className="landing-sub">
          Meet Rose. Play the scammer and watch ScamShield name every manipulation tactic as you
          use it — then seize the call before the damage is done. The bodyguard, not the autopsy.
        </p>

        <AliasForm busy={busy} ended={false} onStart={onStart} variant="hero" />

        <div className="landing-stats">
          {STATS.map((s) => (
            <div key={s.label} className="stat-chip">
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="landing-call">
        <div className="incoming-card">
          <span className="incoming-tag">Incoming call</span>
          <RoseAvatar size={132} ringing />
          <div className="incoming-name">Rose</div>
          <div className="incoming-meta">78 · Ottawa · lives alone</div>
          <div className="incoming-hint">
            <span className="dot-ring" aria-hidden="true" />
            Ringing… pick up as the scammer
          </div>
        </div>
      </div>
    </div>
  );
}
