export type CallState = 'idle' | 'live' | 'ended';

interface HeaderProps {
  connected: boolean;
  callState: CallState;
  elapsed: string;
  muted: boolean;
  onToggleMute: () => void;
}

const STATE_LABEL: Record<CallState, string> = {
  idle: 'NO CALL',
  live: 'LIVE CALL',
  ended: 'CALL TERMINATED',
};

export function Header({ connected, callState, elapsed, muted, onToggleMute }: HeaderProps) {
  return (
    <header>
      <div className="brand">
        <span className="shield">🛡</span> ScamShield <em>Live</em>
      </div>
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
        >
          {muted ? '🔇 Muted' : '🔊 Sound on'}
        </button>
        <div className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'LIVE' : 'DISCONNECTED'}</div>
      </div>
    </header>
  );
}
