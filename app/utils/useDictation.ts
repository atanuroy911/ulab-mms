'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typings for the non-standard Web Speech API (not in lib.dom.d.ts).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Feature + rough browser-support detection for the dictation feature. */
export function getDictationSupport(): { supported: boolean; note?: string } {
  if (typeof window === 'undefined') return { supported: false };
  const ctor = getSpeechRecognitionCtor();
  if (!ctor) {
    return {
      supported: false,
      note: 'Voice dictation needs Chrome, Edge, or Safari 14.1+. This browser does not support the Web Speech API.',
    };
  }
  const ua = window.navigator.userAgent;
  const isFirefox = /firefox/i.test(ua);
  if (isFirefox) {
    return { supported: false, note: 'Firefox does not support the Web Speech API. Try Chrome, Edge, or Safari.' };
  }
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  if (isSafari) {
    return { supported: true, note: 'Safari has limited support: recognition may stop after each pause and needs a restart.' };
  }
  return { supported: true };
}

interface UseDictationOptions {
  /** Called with each finalized (committed) phrase the user spoke. */
  onFinalResult: (transcript: string) => void;
  lang?: string;
}

interface UseDictationResult {
  supported: boolean;
  supportNote?: string;
  listening: boolean;
  interimTranscript: string;
  start: () => void;
  stop: () => void;
  error: string | null;
}

/** Wraps the browser's SpeechRecognition API behind a small, restartable hook. */
export function useDictation({ onFinalResult, lang = 'en-US' }: UseDictationOptions): UseDictationResult {
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalResultRef = useRef(onFinalResult);
  onFinalResultRef.current = onFinalResult;

  const support = getDictationSupport();

  const start = useCallback(() => {
    if (!support.supported) return;
    const ctor = getSpeechRecognitionCtor();
    if (!ctor) return;

    const recognition = new ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          onFinalResultRef.current(transcript);
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      const errName = (event as { error?: string }).error;
      // "no-speech" fires constantly during natural pauses - not a real error.
      if (errName && errName !== 'no-speech' && errName !== 'aborted') {
        setError(errName);
      }
    };

    recognition.onend = () => {
      // Safari/some engines stop after every utterance - auto-restart while "listening" is true.
      if (recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      }
    };

    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }, [lang, support.supported]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    setInterimTranscript('');
    recognition?.stop();
  }, []);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
  }, []);

  return {
    supported: support.supported,
    supportNote: support.note,
    listening,
    interimTranscript,
    start,
    stop,
    error,
  };
}
