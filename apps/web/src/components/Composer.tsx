import { useSpeechInput } from '../hooks/useSpeechInput';

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text?: string) => void;
  onGiveUp: () => void;
  disabled: boolean;
  busy: boolean;
}

export function Composer({ value, onChange, onSubmit, onGiveUp, disabled, busy }: ComposerProps) {
  const speech = useSpeechInput({
    onInterim: (text) => onChange(text),
    onFinal: (text) => onSubmit(text),
  });

  return (
    <div className="composer">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder="Say something to Rose… (you are the scammer)"
        disabled={disabled || busy}
        autoFocus
      />
      {speech.supported && (
        <button
          type="button"
          className={`mic-btn ${speech.listening ? 'recording' : ''}`}
          onClick={speech.toggle}
          disabled={disabled}
          title={speech.listening ? 'Stop recording' : 'Hold-to-talk (click to toggle)'}
          aria-pressed={speech.listening}
        >
          {speech.listening ? '● Recording' : '🎤'}
        </button>
      )}
      <button type="button" className="primary" onClick={() => onSubmit()} disabled={disabled || busy || !value.trim()}>
        {busy ? '…' : 'Send'}
      </button>
      <button type="button" className="give-up-btn" onClick={onGiveUp} disabled={disabled}>
        Give up
      </button>
    </div>
  );
}
