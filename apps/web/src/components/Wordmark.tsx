import { ShieldMark } from './icons';

interface WordmarkProps {
  /** When provided, the lockup becomes a button that returns to the landing view. */
  onHome?: () => void;
}

/** The ScamShield brand lockup: inline-SVG shield + wordmark. No emoji.
 * Clickable (returns home) when onHome is supplied. */
export function Wordmark({ onHome }: WordmarkProps) {
  const inner = (
    <>
      <ShieldMark className="wordmark-shield" width={26} height={26} />
      <span className="wordmark-text">
        Scam<span>Shield</span>
      </span>
      <span className="wordmark-live">LIVE</span>
    </>
  );
  if (!onHome) return <div className="wordmark">{inner}</div>;
  return (
    <button type="button" className="wordmark wordmark-btn" onClick={onHome} aria-label="Back to home">
      {inner}
    </button>
  );
}
