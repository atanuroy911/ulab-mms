'use client';

import { RotateCcw } from 'lucide-react';
import { DictationExam, DictationStudent, DraftMarkEntry } from './types';

interface DictationConfirmStepProps {
  exam: DictationExam;
  student: DictationStudent;
  draft: DraftMarkEntry;
  onEditRaw: (value: string) => void;
  onEditCo: (index: number, value: string) => void;
  onEditNonCo: (value: string) => void;
  onRedoField: (field: 'raw' | `co-${number}` | 'nonco') => void;
  onSave: () => void;
  onBack: () => void;
  saving: boolean;
}

/** Final step: everything dictated so far, editable, before it's POSTed to /api/marks. */
export default function DictationConfirmStep({
  exam,
  student,
  draft,
  onEditRaw,
  onEditCo,
  onEditNonCo,
  onRedoField,
  onSave,
  onBack,
  saving,
}: DictationConfirmStepProps) {
  const numberOfCOs = exam.numberOfCOs || 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-200">Confirm marks</h3>
        <p className="text-sm text-gray-400 mt-1">
          {student.studentId} · {student.name} — {exam.displayName}
        </p>
      </div>

      <FieldRow label={`Raw Mark (max ${exam.totalMarks})`} value={draft.rawMark} onChange={onEditRaw} onRedo={() => onRedoField('raw')} />

      {numberOfCOs > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: numberOfCOs }, (_, i) => (
            <FieldRow
              key={i}
              label={`CO${i + 1}`}
              value={draft.coMarks[i] || ''}
              onChange={(v) => onEditCo(i, v)}
              onRedo={() => onRedoField(`co-${i}`)}
              compact
            />
          ))}
          <FieldRow
            label="Non-CO"
            value={draft.nonCoMark}
            onChange={onEditNonCo}
            onRedo={() => onRedoField('nonco')}
            compact
          />
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all font-medium"
        >
          Back
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 px-6 py-3 bg-linear-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all shadow-lg font-medium text-lg disabled:opacity-60"
        >
          {saving ? 'Saving…' : '💾 Save & Next Student'}
        </button>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  onRedo,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onRedo: () => void;
  compact?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-gray-900 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
            compact ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-lg font-semibold'
          }`}
          placeholder="0"
        />
        <button
          type="button"
          onClick={onRedo}
          title="Redo this field by voice"
          className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
