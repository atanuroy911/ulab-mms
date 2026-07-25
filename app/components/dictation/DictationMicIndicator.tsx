'use client';

import { Mic, MicOff } from 'lucide-react';

interface DictationMicIndicatorProps {
  listening: boolean;
  interimTranscript: string;
  onToggle: () => void;
}

/** Small pulsing mic button + live interim transcript, shared by every dictation step. */
export default function DictationMicIndicator({ listening, interimTranscript, onToggle }: DictationMicIndicatorProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all ${
          listening ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
        }`}
      >
        {listening && (
          <span className="absolute inset-0 rounded-full bg-red-500/50 animate-ping" />
        )}
        {listening ? (
          <Mic className="w-7 h-7 text-white relative" />
        ) : (
          <MicOff className="w-7 h-7 text-gray-300 relative" />
        )}
      </button>
      <div className="min-h-[1.5rem] text-sm text-gray-300 italic text-center px-4">
        {interimTranscript || (listening ? 'Listening…' : 'Tap the mic to speak')}
      </div>
    </div>
  );
}
