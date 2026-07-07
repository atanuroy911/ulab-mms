'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save, Loader2, AlertTriangle } from 'lucide-react';
import { notify } from '@/app/utils/notifications';

interface Student {
  _id: string;
  studentId: string;
  name: string;
}

interface Exam {
  _id: string;
  displayName: string;
  totalMarks: number;
  numberOfCOs?: number;
}

interface Mark {
  _id: string;
  studentId: string;
  examId: string;
  rawMark: number;
}

interface BulkPasteMarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  exams: Exam[];
  marks: Mark[];
  courseId: string;
  onMarksSaved: () => void;
  coPoMaxMarks?: Record<string, number[]>;
}

interface ParsedRow {
  raw: string;
  rawStudentId: string;
  rawMarkText: string;
  student?: Student;
  rawMarkNum?: number;
  existingMark?: number;
  error?: string;
}

function parsePastedText(text: string, students: Student[], totalMarks: number, examMarks: Mark[]): ParsedRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  return lines.map(line => {
    const parts = line.split(/\t|,/).map(p => p.trim()).filter(p => p.length > 0);
    const rawStudentId = parts[0] || '';
    const rawMarkText = parts[1] || '';

    const student = students.find(
      s => s.studentId.trim().toLowerCase() === rawStudentId.toLowerCase()
    );

    const existingMark = student
      ? examMarks.find(m => m.studentId === student._id)?.rawMark
      : undefined;

    const rawMarkNum = parseFloat(rawMarkText);

    let error: string | undefined;
    if (!rawStudentId) {
      error = 'Missing student ID';
    } else if (!student) {
      error = `No student found with ID "${rawStudentId}"`;
    } else if (!rawMarkText || isNaN(rawMarkNum)) {
      error = 'Missing or invalid mark';
    } else if (rawMarkNum < 0 || rawMarkNum > totalMarks) {
      error = `Mark must be between 0 and ${totalMarks}`;
    }

    return {
      raw: line,
      rawStudentId,
      rawMarkText,
      student,
      rawMarkNum: isNaN(rawMarkNum) ? undefined : rawMarkNum,
      existingMark,
      error,
    };
  });
}

function computeCoMarks(
  rawMarkNum: number,
  numberOfCOs: number,
  totalMarks: number,
  examMaxMarks?: number[]
): { coMarks?: number[]; nonCoMark?: number } {
  if (numberOfCOs <= 0) return {};

  if (rawMarkNum === totalMarks) {
    const coMarks = Array.from({ length: numberOfCOs }, (_, i) => {
      const coMax = examMaxMarks?.[i];
      return coMax !== undefined && coMax > 0 ? coMax : 0;
    });
    const configured = examMaxMarks && examMaxMarks.slice(0, numberOfCOs).some(m => m > 0);
    return configured ? { coMarks } : {};
  }

  if (rawMarkNum === 0) {
    return { coMarks: new Array(numberOfCOs).fill(0), nonCoMark: 0 };
  }

  return {};
}

export default function BulkPasteMarkModal({
  isOpen,
  onClose,
  students,
  exams,
  marks,
  courseId,
  onMarksSaved,
  coPoMaxMarks = {},
}: BulkPasteMarkModalProps) {
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [pasteText, setPasteText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedExams = exams.filter(e => e._id === selectedExamId);

  const selectExam = (examId: string) => {
    setSelectedExamId(prev => (prev === examId ? '' : examId));
  };

  const handleClose = () => {
    setSelectedExamId('');
    setPasteText({});
    setError('');
    onClose();
  };

  const parsedByExam: Record<string, ParsedRow[]> = {};
  for (const exam of selectedExams) {
    const examMarks = marks.filter(m => m.examId === exam._id);
    parsedByExam[exam._id] = parsePastedText(pasteText[exam._id] || '', students, exam.totalMarks, examMarks);
  }

  const handleSave = async () => {
    setError('');
    setSaving(true);

    let successCount = 0;
    let failCount = 0;

    try {
      for (const exam of selectedExams) {
        const rows = parsedByExam[exam._id];
        const validRows = rows.filter(r => !r.error && r.student && r.rawMarkNum !== undefined);

        for (const row of validRows) {
          const numberOfCOs = exam.numberOfCOs || 0;
          const examMaxMarks = coPoMaxMarks[exam._id];
          const { coMarks, nonCoMark } = computeCoMarks(
            row.rawMarkNum!,
            numberOfCOs,
            exam.totalMarks,
            examMaxMarks
          );

          const response = await fetch('/api/marks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              courseId,
              studentId: row.student!._id,
              examId: exam._id,
              rawMark: row.rawMarkNum,
              coMarks,
              nonCoMark,
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        }
      }

      setSaving(false);

      if (successCount > 0) {
        notify.mark.bulkSaved(successCount);
        onMarksSaved();
        handleClose();
      } else {
        notify.mark.bulkSaveError();
        setError('No marks were saved. Please check the pasted data.');
      }

      if (failCount > 0 && successCount > 0) {
        notify.mark.bulkSaveError(`${failCount} mark(s) failed to save`);
      }
    } catch (err) {
      console.error('Error saving bulk pasted marks:', err);
      notify.mark.bulkSaveError();
      setError('An error occurred while saving marks');
      setSaving(false);
    }
  };

  const totalValidRows = selectedExams.reduce(
    (sum, exam) => sum + parsedByExam[exam._id].filter(r => !r.error).length,
    0
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-100 p-4">
      <div className="bg-linear-to-br from-gray-800 to-gray-800/80 rounded-2xl shadow-2xl w-full max-w-[95vw] h-[90vh] border border-gray-700/50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-100">Bulk Paste Marks</h2>
            <p className="text-sm text-gray-400 mt-1">
              Select an exam, then paste rows of "Student ID, Mark" (e.g. exported from Google Classroom)
            </p>
          </div>
          <Button onClick={handleClose} variant="ghost" size="sm" className="text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Exam selection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-200 mb-3">Select an exam:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {exams.map(exam => {
                const isSelected = exam._id === selectedExamId;
                const examMarks = marks.filter(m => m.examId === exam._id).length;
                return (
                  <button
                    key={exam._id}
                    onClick={() => selectExam(exam._id)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected ? 'border-green-500 bg-green-900/30' : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-semibold text-gray-100">{exam.displayName}</div>
                    <div className="text-sm text-gray-400 mt-1">
                      Total: {exam.totalMarks} marks
                      {exam.numberOfCOs ? ` • ${exam.numberOfCOs} COs` : ''}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {examMarks}/{students.length} students entered
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
          )}

          {/* Paste areas per selected exam */}
          {selectedExams.map(exam => {
            const rows = parsedByExam[exam._id];
            const validCount = rows.filter(r => !r.error).length;
            const errorCount = rows.length - validCount;
            const overwriteCount = rows.filter(r => !r.error && r.existingMark !== undefined).length;

            return (
              <div key={exam._id} className="border border-gray-700 rounded-lg p-4 bg-gray-900/40">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-200">{exam.displayName}</h4>
                  {rows.length > 0 && (
                    <div className="text-xs">
                      <span className="text-emerald-400">{validCount} valid</span>
                      {overwriteCount > 0 && <span className="text-blue-400 ml-2">{overwriteCount} will overwrite existing</span>}
                      {errorCount > 0 && <span className="text-amber-400 ml-2">{errorCount} error(s)</span>}
                    </div>
                  )}
                </div>
                <textarea
                  value={pasteText[exam._id] || ''}
                  onChange={(e) => setPasteText(prev => ({ ...prev, [exam._id]: e.target.value }))}
                  placeholder={'Paste rows here, e.g.:\nID2021001\t85\nID2021002\t92'}
                  rows={6}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 placeholder-gray-500 font-mono text-sm"
                />

                {rows.length > 0 && (
                  <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-gray-700">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-900 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">Row</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">Student</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">Old Mark</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">New Mark</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-400">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {rows.map((row, idx) => {
                          const hasExisting = row.existingMark !== undefined;
                          const isChanged = hasExisting && row.rawMarkNum !== undefined && row.rawMarkNum !== row.existingMark;
                          return (
                            <tr key={idx} className={row.error ? 'bg-amber-900/10' : hasExisting ? 'bg-blue-900/10' : ''}>
                              <td className="px-3 py-2 text-gray-400">{row.rawStudentId || '—'}</td>
                              <td className="px-3 py-2 text-gray-200">
                                {row.student ? `${row.student.studentId} · ${row.student.name}` : '—'}
                              </td>
                              <td className="px-3 py-2">
                                {hasExisting ? (
                                  <span className="text-gray-400">{row.existingMark}</span>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className={isChanged ? 'text-blue-300 font-semibold' : 'text-gray-200'}>
                                  {row.rawMarkText || '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {row.error ? (
                                  <span className="inline-flex items-center gap-1 text-amber-400 text-xs">
                                    <AlertTriangle className="w-3 h-3" /> {row.error}
                                  </span>
                                ) : hasExisting ? (
                                  <span className="text-blue-400 text-xs">↻ Will overwrite existing mark</span>
                                ) : (
                                  <span className="text-emerald-400 text-xs">✓ New mark</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {selectedExams.length > 0 && (
          <div className="p-6 border-t border-gray-700 flex gap-3">
            <Button onClick={handleClose} variant="outline" className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || totalValidRows === 0}
              className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save {totalValidRows} Mark{totalValidRows !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
