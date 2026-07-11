import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechInputArgs {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
}

interface UseSpeechInput {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
}

function getRecognitionCtor(): SpeechRecognitionConstructor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/** Push-to-talk voice input via the Web Speech API. Toggle start/stop; interim
 * transcripts stream to `onInterim`, the final transcript fires `onFinal` once
 * and recognition stops itself. Feature-detected — `supported` is false (and the
 * caller should hide its mic button) on browsers without SpeechRecognition. */
export function useSpeechInput({ onInterim, onFinal }: UseSpeechInputArgs): UseSpeechInput {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const supported = getRecognitionCtor() !== null;

  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  onInterimRef.current = onInterim;
  onFinalRef.current = onFinal;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) final += transcript;
        else interim += transcript;
      }
      if (final.trim()) onFinalRef.current(final.trim());
      else if (interim.trim()) onInterimRef.current(interim);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    };
  }, []);

  const toggle = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      try {
        recognition.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  }, [listening]);

  return { supported, listening, toggle };
}
