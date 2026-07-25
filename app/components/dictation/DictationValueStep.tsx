'use client';

import DictationMicIndicator from './DictationMicIndicator';

interface DictationValueStepProps {
  title: string;
  subtitle?: string;
  value: string;
  onValueChange: (value: string) => void;
  listening: boolean;
  interimTranscript: string;
  onToggleMic: () => void;
  maxValue?: number;
}

/** Reused for Raw Mark, each CO mark, and the Non-CO mark - one number per screen. */
export default function DictationValueStep({
  title,
  subtitle,
  value,
  onValueChange,
  listening,
  interimTranscript,
  onToggleMic,
  maxValue,
}: DictationValueStepProps) {
  const overMax = maxValue !== undefined && value !== '' && parseFloat(value) > maxValue;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
        {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      </div>

      <DictationMicIndicator listening={listening} interimTranscript={interimTranscript} onToggle={onToggleMic} />

      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="Recognized number appears here…"
        className={`w-full max-w-xs px-4 py-4 bg-gray-900 border rounded-lg text-center text-3xl font-bold text-gray-100 focus:ring-2 focus:border-transparent ${
          overMax ? 'border-amber-500 focus:ring-amber-500 text-amber-300' : 'border-gray-600 focus:ring-purple-500'
        }`}
        autoFocus
      />
      {overMax && <p className="text-xs text-amber-400">Exceeds max of {maxValue}</p>}

      <p className="text-xs text-gray-500 text-center">
        Say a number (or &quot;zero&quot;/&quot;skip&quot;), then say &quot;next&quot; or press Enter.
        Or name a field anytime, e.g. &quot;CO1 is 24&quot; / &quot;non co 3&quot;.
      </p>
    </div>
  );
}
