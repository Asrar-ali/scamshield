import { useSpeechInput } from '../hooks/useSpeechInput';
import { MicIcon, SendIcon } from './icons';

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text?: string) => void;
  onGiveUp: () => void;
  disabled: boolean;
  busy: boolean;
  /** Show quick-start suggestion chips (first turn only). */
  showSuggestions: boolean;
  /** True when a Telegram-originated session is live — the judge is typing on
   * their phone instead, so the text input/mic/send are inert but Give up
   * still works. */
  viewOnly?: boolean;
}

const SUGGESTIONS = [
  "You've won a prize — I just need a small fee…",
  'This is the CRA. There is a warrant for your arrest.',
  "Grandma, it's me — I'm in trouble and need money.",
];

export function Composer({ value, onChange, onSubmit, onGiveUp, disabled, busy, showSuggestions, viewOnly = false }: ComposerProps) {
  const speech = useSpeechInput({
    onInterim: (text) => onChange(text),
    onFinal: (text) => onSubmit(text),
  });

  return (
    <div className="composer-shell">
      {showSuggestions && (
        <div className="suggestions" aria-label="Quick-start scam openers">
          <span className="suggestions-label">Try an opener</span>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="suggestion-chip" onClick={() => onChange(s)} disabled={disabled || busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <div className="composer-input-wrap">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            placeholder="Say something to Rose… you are the scammer"
            disabled={disabled || busy || viewOnly}
            autoFocus
          />
        </div>

        {speech.supported && (
          <button
            type="button"
            className={`mic-btn ${speech.listening ? 'recording' : ''}`}
            onClick={speech.toggle}
            disabled={disabled || viewOnly}
            title={speech.listening ? 'Stop recording' : 'Speak your line'}
            aria-pressed={speech.listening}
            aria-label={speech.listening ? 'Stop recording' : 'Speak your line'}
          >
            <MicIcon width={18} height={18} />
            <span className="mic-label">{speech.listening ? 'Listening…' : 'Speak'}</span>
          </button>
        )}

        <button
          type="button"
          className="send-btn"
          onClick={() => onSubmit()}
          disabled={disabled || busy || viewOnly || !value.trim()}
        >
          <SendIcon width={17} height={17} />
          Send
        </button>

        <button type="button" className="give-up-btn" onClick={onGiveUp} disabled={disabled}>
          Give up
        </button>
      </div>
    </div>
  );
}
