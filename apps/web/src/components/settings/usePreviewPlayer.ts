import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTtsPreview, type TtsRole } from '../../lib/api';

export type PreviewStatus = 'idle' | 'loading' | 'playing' | 'offline' | 'error';

/**
 * Drives voice-preview playback for the AI tab. Only one preview plays at a time —
 * starting a new one stops whatever's currently playing. `activeId` identifies which
 * button (keyed by role, e.g. "grandma") is loading/playing so each VoicePicker can
 * render its own button state without a shared parent re-render dance.
 */
export function usePreviewPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('idle');

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setActiveId(null);
    setStatus('idle');
  }, []);

  useEffect(() => () => stop(), [stop]);

  const play = useCallback(
    async (id: string, text: string, role: TtsRole, voiceId: string) => {
      stop();
      setActiveId(id);
      setStatus('loading');
      const result = await fetchTtsPreview(text, role, voiceId);
      if (!result.ok || !result.blob) {
        setStatus(result.offline ? 'offline' : 'error');
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      urlRef.current = url;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setStatus('idle');
        setActiveId(null);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setStatus('error');
        setActiveId(null);
      };
      setStatus('playing');
      audio.play().catch(() => setStatus('error'));
    },
    [stop],
  );

  return { activeId, status, play, stop };
}
