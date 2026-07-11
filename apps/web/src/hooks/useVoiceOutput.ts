import { useCallback, useEffect, useRef } from 'react';
import { fetchTts, type TtsRole } from '../lib/api';

interface QueueItem {
  text: string;
  role: TtsRole;
}

function speakWithBrowser(text: string, role: TtsRole): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    if (role === 'grandma') {
      utterance.pitch = 1.4;
      utterance.rate = 0.85;
    } else {
      utterance.pitch = 0.65;
      utterance.rate = 1.05;
    }
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    audio.play().catch(cleanup);
  });
}

/** Sequential TTS playback queue so grandma/guardian lines never overlap.
 * Tries the server's /api/tts first; falls back to speechSynthesis on any
 * failure (503 fallback flag, network error, unsupported content-type).
 * Muting is checked per-queued-item so toggling mute mid-call takes effect
 * on the next line without needing to flush the queue. */
export function useVoiceOutput(muted: boolean) {
  const queueRef = useRef<QueueItem[]>([]);
  const drainingRef = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (muted) window.speechSynthesis?.cancel();
  }, [muted]);

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift();
      if (!item) break;
      if (mutedRef.current) continue;
      const blob = await fetchTts(item.text, item.role);
      if (blob) await playBlob(blob);
      else await speakWithBrowser(item.text, item.role);
    }
    drainingRef.current = false;
  }, []);

  const enqueue = useCallback(
    (text: string, role: TtsRole) => {
      queueRef.current.push({ text, role });
      void drain();
    },
    [drain],
  );

  return { enqueue };
}
