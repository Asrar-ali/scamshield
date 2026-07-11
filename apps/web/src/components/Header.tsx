import { Wordmark } from './Wordmark';
import { GearIcon } from './icons';

export type CallState = 'idle' | 'live' | 'ended';

interface HeaderProps {
  connected: boolean;
  callState: CallState;
  elapsed: string;
  muted: boolean;
  onToggleMute: () => void;
  onOpenSettings: () => void;
}

const STATE_LABEL: Record<CallState, string> = {
  idle: 'NO CALL',
  live: 'LIVE CALL',
  ended: 'CALL TERMINATED',
};

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
      {muted ? <path d="M16 9.5l4 5M20 9.5l-4 5" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}

export function Header({ connected, callState, elapsed, muted, onToggleMute, onOpenSettings }: HeaderProps) {
  return (
    <header className="app-header">
      <Wordmark />
      <div className="header-status">
        <div className={`call-state call-state-${callState}`}>
          <span className="dot" />
          {STATE_LABEL[callState]}
          {callState === 'live' && <span className="timer">{elapsed}</span>}
        </div>
        <button
          type="button"
          className={`mute-toggle ${muted ? 'muted' : ''}`}
          onClick={onToggleMute}
          title={muted ? 'Unmute voices' : 'Mute voices'}
          aria-label={muted ? 'Unmute voices' : 'Mute voices'}
        >
          <SoundIcon muted={muted} />
          {muted ? 'Muted' : 'Sound on'}
        </button>
        <div className={`conn ${connected ? 'on' : 'off'}`}>
          <span className="conn-dot" />
          {connected ? 'CONNECTED' : 'OFFLINE'}
        </div>
        <button type="button" className="icon-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
          <GearIcon width={16} height={16} />
        </button>
      </div>
    </header>
  );
}
