'use client';

import DictationMicIndicator from './DictationMicIndicator';
import { DictationStudent } from './types';

interface DictationStudentStepProps {
  students: DictationStudent[];
  query: string;
  onQueryChange: (value: string) => void;
  onConfirm: (studentId: string) => void;
  listening: boolean;
  interimTranscript: string;
  onToggleMic: () => void;
}

/** Step 2: say (or type) a student ID/name, then say "next" or press Enter to lock it in. */
export default function DictationStudentStep({
  students,
  query,
  onQueryChange,
  onConfirm,
  listening,
  interimTranscript,
  onToggleMic,
}: DictationStudentStepProps) {
  const filtered = query
    ? students.filter(
        s =>
          s.studentId.toLowerCase().includes(query.toLowerCase()) ||
          s.name.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const topMatch = filtered[0];

  return (
    <div className="flex flex-col items-center gap-6">
      <h3 className="text-lg font-semibold text-gray-200">Say the student&apos;s ID or name</h3>
      <p className="text-xs text-gray-500 text-center -mt-4 max-w-sm">
        Spacing between digits is ignored — an exact ID match jumps to the next step instantly
      </p>
      <DictationMicIndicator listening={listening} interimTranscript={interimTranscript} onToggle={onToggleMic} />

      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && topMatch) onConfirm(topMatch._id);
        }}
        placeholder="Recognized ID or name appears here…"
        className="w-full max-w-sm px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-center text-lg text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        autoFocus
      />

      {filtered.length > 0 && (
        <div className="w-full max-w-sm max-h-48 overflow-y-auto bg-gray-900 border border-gray-600 rounded-lg">
          {filtered.slice(0, 6).map(student => (
            <button
              key={student._id}
              onClick={() => onConfirm(student._id)}
              className={`w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0 ${
                student._id === topMatch?._id ? 'bg-purple-900/30' : ''
              }`}
            >
              <div className="font-medium text-purple-300">{student.studentId}</div>
              <div className="text-sm text-gray-400">{student.name}</div>
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        Say &quot;next&quot; or press Enter to confirm the highlighted student
      </p>
    </div>
  );
}
