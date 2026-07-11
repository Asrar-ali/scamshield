import { ShieldMark } from './icons';

/** The ScamShield brand lockup: inline-SVG shield + wordmark. No emoji. */
export function Wordmark() {
  return (
    <div className="wordmark">
      <ShieldMark className="wordmark-shield" width={26} height={26} />
      <span className="wordmark-text">
        Scam<span>Shield</span>
      </span>
      <span className="wordmark-live">LIVE</span>
    </div>
  );
}
