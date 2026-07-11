import { useEffect, useState } from 'react';
import { fetchVoices, type Settings, type TtsRole, type VoiceInfo } from '../../lib/api';
import { ModelPicker } from './ModelPicker';
import { VoicePicker } from './VoicePicker';
import { usePreviewPlayer } from './usePreviewPlayer';

/** Fixed short in-character lines used for voice previews — same line every time so the
 * comparison between voices is apples-to-apples. */
const PREVIEW_LINES: Record<TtsRole, string> = {
  grandma: 'Oh hello dear, thank you for calling to check on me.',
  guardian: 'This call has been flagged and a family member has been notified.',
};

type LoadState = 'loading' | 'ready' | 'unavailable';

interface AITabProps {
  settings: Settings;
  onModelChange: (model: string) => void;
  onVoiceChange: (role: TtsRole, voiceId: string) => void;
}

/** AI tab: which model runs the conversation, and which voice speaks for each role. */
export function AITab({ settings, onModelChange, onVoiceChange }: AITabProps) {
  const [voices, setVoices] = useState<VoiceInfo[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const player = usePreviewPlayer();

  useEffect(() => {
    let cancelled = false;
    void fetchVoices().then((res) => {
      if (cancelled) return;
      if (res && Array.isArray(res.voices)) {
        setVoices(res.voices);
        setLoadState('ready');
      } else {
        setLoadState('unavailable');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = (role: TtsRole) => {
    const voiceId = role === 'grandma' ? settings.voices.grandma : settings.voices.guardian;
    if (!voiceId) return;
    if (player.activeId === role && player.status === 'playing') {
      player.stop();
      return;
    }
    void player.play(role, PREVIEW_LINES[role], role, voiceId);
  };

  return (
    <>
      <ModelPicker selected={settings.model} onSelect={onModelChange} />
      <section className="settings-section">
        <h3>Voices</h3>
        <VoicePicker
          label="Rose's voice"
          value={settings.voices.grandma}
          voices={voices}
          loadState={loadState}
          previewStatus={player.activeId === 'grandma' ? player.status : 'idle'}
          onChange={(id) => onVoiceChange('grandma', id)}
          onPreview={() => preview('grandma')}
        />
        <VoicePicker
          label="Guardian's voice"
          value={settings.voices.guardian}
          voices={voices}
          loadState={loadState}
          previewStatus={player.activeId === 'guardian' ? player.status : 'idle'}
          onChange={(id) => onVoiceChange('guardian', id)}
          onPreview={() => preview('guardian')}
        />
      </section>
    </>
  );
}
