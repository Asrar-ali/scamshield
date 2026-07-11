import type { VoiceInfo } from '../../lib/api';
import type { PreviewStatus } from './usePreviewPlayer';

type LoadState = 'loading' | 'ready' | 'unavailable';

interface VoicePickerProps {
  label: string;
  value: string;
  voices: VoiceInfo[] | null;
  loadState: LoadState;
  previewStatus: PreviewStatus;
  onChange: (voiceId: string) => void;
  onPreview: () => void;
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5-13-7.5Z" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function SpinnerGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden="true" className="voice-spinner">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={2.4} strokeDasharray="34 90" strokeLinecap="round" />
    </svg>
  );
}

/** One voice <select> + a single-preview play button. Fed by GET /api/voices; the preview
 * button POSTs /api/tts through usePreviewPlayer and disables with a quiet note on a 503
 * (voice service offline / keyless) or when the voice list itself never loaded. */
export function VoicePicker({ label, value, voices, loadState, previewStatus, onChange, onPreview }: VoicePickerProps) {
  const disabled = loadState !== 'ready' || !voices || voices.length === 0;
  const playing = previewStatus === 'playing';
  const loading = previewStatus === 'loading';
  const offline = previewStatus === 'offline';

  return (
    <div className="voice-picker">
      <span className="voice-picker-label">{label}</span>
      {loadState === 'unavailable' ? (
        <p className="settings-unavailable">Voice list unavailable.</p>
      ) : (
        <div className="voice-picker-row">
          <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label}>
            {(voices ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`voice-preview-btn ${playing ? 'is-playing' : ''}`}
            onClick={onPreview}
            disabled={disabled || !value || loading}
            aria-label={`Preview ${label}`}
          >
            {loading ? <SpinnerGlyph /> : playing ? <StopGlyph /> : <PlayGlyph />}
          </button>
        </div>
      )}
      {offline && <p className="settings-hint">Voice service offline — preview unavailable.</p>}
    </div>
  );
}
