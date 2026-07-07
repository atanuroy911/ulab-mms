'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
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
  numberOfQuestions?: number;
}

interface Mark {
  _id: string;
  studentId: string;
  examId: string;
  rawMark: number;
  coMarks?: number[];
  nonCoMark?: number;
  questionMarks?: number[];
}

interface BulkMarkEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  exams: Exam[];
  marks: Mark[];
  courseId: string;
  onMarksSaved: () => void;
  // CO validation props
  coPoMaxMarks?: Record<string, number[]>;
  onGoToCoPo?: () => void;
  ignoredCoWarnings?: Set<string>;
  onIgnoreCOWarning?: (examId: string) => void;
}

interface MarkEntry {
  studentId: string;
  rawMark: string;
  coMarks: string[];
  nonCoMark: string;
  questionMarks: string[];
}

export default function BulkMarkEntryModal({
  isOpen,
  onClose,
  students,
  exams,
  marks,
  courseId,
  onMarksSaved,
  coPoMaxMarks = {},
  onGoToCoPo,
  ignoredCoWarnings = new Set(),
  onIgnoreCOWarning,
}: BulkMarkEntryModalProps) {
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [markEntries, setMarkEntries] = useState<MarkEntry[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);
  const [emptyCount, setEmptyCount] = useState(0);
  const [showCoWarning, setShowCoWarning] = useState(false);
  
  // Refs for all input fields
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const selectedExam = exams.find(e => e._id === selectedExamId);
  const numberOfCOs = selectedExam?.numberOfCOs || 0;
  const numberOfQuestions = selectedExam?.numberOfQuestions || 0;

  // Initialize mark entries when exam is selected
  useEffect(() => {
    if (selectedExamId && students.length > 0) {
      const entries: MarkEntry[] = students.map(student => {
        const existingMark = marks.find(m => m.studentId === student._id && m.examId === selectedExamId);
        
        return {
          studentId: student._id,
          rawMark: existingMark?.rawMark?.toString() || '',
          coMarks: existingMark?.coMarks?.map(m => m.toString()) || new Array(numberOfCOs).fill(''),
          nonCoMark: existingMark?.nonCoMark?.toString() || '',
          questionMarks: existingMark?.questionMarks?.map(m => m.toString()) || new Array(numberOfQuestions).fill(''),
        };
      });
      setMarkEntries(entries);
    }
  }, [selectedExamId, students, marks, numberOfCOs, numberOfQuestions]);

  // Focus first input when exam is selected
  useEffect(() => {
    if (selectedExamId && markEntries.length > 0) {
      setTimeout(() => {
        const firstKey = getFieldKey(0, 'rawMark');
        inputRefs.current[firstKey]?.focus();
      }, 100);
    }
  }, [selectedExamId, markEntries.length]);

  const getFieldKey = (studentIndex: number, field: string, subIndex?: number): string => {
    if (subIndex !== undefined) {
      return `${studentIndex}-${field}-${subIndex}`;
    }
    return `${studentIndex}-${field}`;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, studentIndex: number, field: string, subIndex?: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      moveToNextField(studentIndex, field, subIndex, e.shiftKey);
    }
  };

  const moveToNextField = (studentIndex: number, field: string, subIndex: number | undefined, isShiftTab: boolean) => {
    if (isShiftTab) {
      moveToPreviousField(studentIndex, field, subIndex);
    } else {
      moveToNextFieldForward(studentIndex, field, subIndex);
    }
  };

  const moveToNextFieldForward = (studentIndex: number, field: string, subIndex: number | undefined) => {
    // If we're in rawMark field
    if (field === 'rawMark') {
      if (numberOfCOs > 0) {
        // Move to first CO
        const nextKey = getFieldKey(studentIndex, 'co', 0);
        inputRefs.current[nextKey]?.focus();
      } else if (numberOfQuestions > 0) {
        // Move to first Question
        const nextKey = getFieldKey(studentIndex, 'q', 0);
        inputRefs.current[nextKey]?.focus();
      } else {
        // Move to next student's rawMark
        if (studentIndex < students.length - 1) {
          const nextKey = getFieldKey(studentIndex + 1, 'rawMark');
          inputRefs.current[nextKey]?.focus();
        }
      }
    }
    // If we're in a CO field
    else if (field === 'co' && subIndex !== undefined) {
      if (subIndex < numberOfCOs - 1) {
        // Move to next CO
        const nextKey = getFieldKey(studentIndex, 'co', subIndex + 1);
        inputRefs.current[nextKey]?.focus();
      } else {
        // Move to Non-CO
        const nextKey = getFieldKey(studentIndex, 'nonCo');
        inputRefs.current[nextKey]?.focus();
      }
    }
    // If we're in Non-CO field
    else if (field === 'nonCo') {
      if (numberOfQuestions > 0) {
        // Move to first Question
        const nextKey = getFieldKey(studentIndex, 'q', 0);
        inputRefs.current[nextKey]?.focus();
      } else {
        // Move to next student's rawMark
        if (studentIndex < students.length - 1) {
          const nextKey = getFieldKey(studentIndex + 1, 'rawMark');
          inputRefs.current[nextKey]?.focus();
        }
      }
    }
    // If we're in a Question field
    else if (field === 'q' && subIndex !== undefined) {
      if (subIndex < numberOfQuestions - 1) {
        // Move to next Question
        const nextKey = getFieldKey(studentIndex, 'q', subIndex + 1);
        inputRefs.current[nextKey]?.focus();
      } else {
        // Move to next student's rawMark
        if (studentIndex < students.length - 1) {
          const nextKey = getFieldKey(studentIndex + 1, 'rawMark');
          inputRefs.current[nextKey]?.focus();
        }
      }
    }
  };

  const moveToPreviousField = (studentIndex: number, field: string, subIndex: number | undefined) => {
    // If we're in rawMark field
    if (field === 'rawMark') {
      if (studentIndex > 0) {
        // Move to previous student's last field
        if (numberOfQuestions > 0) {
          const prevKey = getFieldKey(studentIndex - 1, 'q', numberOfQuestions - 1);
          inputRefs.current[prevKey]?.focus();
        } else if (numberOfCOs > 0) {
          const prevKey = getFieldKey(studentIndex - 1, 'co', numberOfCOs - 1);
          inputRefs.current[prevKey]?.focus();
        } else {
          const prevKey = getFieldKey(studentIndex - 1, 'rawMark');
          inputRefs.current[prevKey]?.focus();
        }
      }
    }
    // If we're in a CO field
    else if (field === 'co' && subIndex !== undefined) {
      if (subIndex > 0) {
        // Move to previous CO
        const prevKey = getFieldKey(studentIndex, 'co', subIndex - 1);
        inputRefs.current[prevKey]?.focus();
      } else {
        // Move to rawMark
        const prevKey = getFieldKey(studentIndex, 'rawMark');
        inputRefs.current[prevKey]?.focus();
      }
    }
    // If we're in Non-CO field
    else if (field === 'nonCo') {
      // Move to last CO
      const prevKey = getFieldKey(studentIndex, 'co', numberOfCOs - 1);
      inputRefs.current[prevKey]?.focus();
    }
    // If we're in a Question field
    else if (field === 'q' && subIndex !== undefined) {
      if (subIndex > 0) {
        // Move to previous Question
        const prevKey = getFieldKey(studentIndex, 'q', subIndex - 1);
        inputRefs.current[prevKey]?.focus();
      } else if (numberOfCOs > 0) {
        // Move to Non-CO
        const prevKey = getFieldKey(studentIndex, 'nonCo');
        inputRefs.current[prevKey]?.focus();
      } else {
        // Move to rawMark
        const prevKey = getFieldKey(studentIndex, 'rawMark');
        inputRefs.current[prevKey]?.focus();
      }
    }
  };

  const updateMarkEntry = (studentIndex: number, field: string, value: string, subIndex?: number) => {
    setMarkEntries(prev => {
      const newEntries = [...prev];
      if (field === 'rawMark') {
        newEntries[studentIndex].rawMark = value;

        if (numberOfCOs > 0 && selectedExam) {
          const rawMarkNum = parseFloat(value);
          const examMaxMarks = coPoMaxMarks[selectedExamId];

          if (!isNaN(rawMarkNum) && rawMarkNum === selectedExam.totalMarks) {
            newEntries[studentIndex].coMarks = newEntries[studentIndex].coMarks.map((val, i) => {
              if (val.trim() !== '') return val;
              const coMax = examMaxMarks?.[i];
              return coMax !== undefined && coMax > 0 ? coMax.toString() : val;
            });
          } else if (!isNaN(rawMarkNum) && rawMarkNum === 0) {
            newEntries[studentIndex].coMarks = newEntries[studentIndex].coMarks.map(() => '0');
            newEntries[studentIndex].nonCoMark = '0';
          }
        }
      } else if (field === 'co' && subIndex !== undefined) {
        const newCoMarks = [...newEntries[studentIndex].coMarks];
        newCoMarks[subIndex] = value;
        newEntries[studentIndex].coMarks = newCoMarks;
      } else if (field === 'nonCo') {
        newEntries[studentIndex].nonCoMark = value;
      } else if (field === 'q' && subIndex !== undefined) {
        const newQuestionMarks = [...newEntries[studentIndex].questionMarks];
        newQuestionMarks[subIndex] = value;
        newEntries[studentIndex].questionMarks = newQuestionMarks;
      }
      return newEntries;
    });
  };

  const validateAndSave = async (fillEmptyWithZero: boolean = false) => {
    if (!selectedExam) return;

    setError('');
    setSaving(true);

    try {
      const marksToSave = [];
      
      for (let i = 0; i < markEntries.length; i++) {
        const entry = markEntries[i];
        const rawMarkValue = entry.rawMark.trim();
        
        // Skip if empty and not filling with zeros
        if (!rawMarkValue) {
          if (!fillEmptyWithZero) {
            continue;
          }
        }

        const rawMarkNum = fillEmptyWithZero && !rawMarkValue ? 0 : parseFloat(rawMarkValue);

        // Validate raw mark
        if (isNaN(rawMarkNum) || rawMarkNum < 0) {
          setError(`Invalid mark for ${students[i].studentId}: Must be a positive number`);
          setSaving(false);
          return;
        }

        if (rawMarkNum > selectedExam.totalMarks) {
          setError(`Invalid mark for ${students[i].studentId}: Exceeds maximum of ${selectedExam.totalMarks}`);
          setSaving(false);
          return;
        }

        // Prepare mark data
        const markData: any = {
          studentId: entry.studentId,
          examId: selectedExamId,
          rawMark: rawMarkNum,
        };

        // Validate CO marks if applicable
        if (numberOfCOs > 0) {
          const coMarksNum = entry.coMarks.map(cm => {
            const val = cm.trim();
            return val ? parseFloat(val) : 0;
          });
          
          let nonCoMarkPayload: number | null = null;
          let nonCoCalcValue = 0;
          if (entry.nonCoMark.trim() !== '') {
            nonCoCalcValue = parseFloat(entry.nonCoMark.trim());
            nonCoMarkPayload = nonCoCalcValue;
            
            if (isNaN(nonCoCalcValue) || nonCoCalcValue < 0) {
              setError(`Invalid Non-CO mark for ${students[i].studentId}: Must be a positive number`);
              setSaving(false);
              return;
            }
          }

          // Check if all CO marks are valid
          if (coMarksNum.some(cm => isNaN(cm) || cm < 0)) {
            setError(`Invalid CO marks for ${students[i].studentId}: Must be positive numbers`);
            setSaving(false);
            return;
          }

          // Check if CO + Non-CO marks sum equals raw mark
          const coMarksSum = coMarksNum.reduce((sum, cm) => sum + cm, 0);
          const totalCoSum = coMarksSum + nonCoCalcValue;
          if (Math.abs(totalCoSum - rawMarkNum) > 0.01) {
            setError(`CO + Non-CO marks for ${students[i].studentId} must sum to ${rawMarkNum}. Current sum: ${totalCoSum.toFixed(2)}`);
            setSaving(false);
            return;
          }

          // Check if CO marks exceed configured maximums (if maxMarks are set)
          const examMaxMarks = coPoMaxMarks[selectedExamId];
          const maxMarksConfigured = examMaxMarks && examMaxMarks.slice(0, numberOfCOs).some(m => m > 0);
          if (maxMarksConfigured) {
            for (let coIdx = 0; coIdx < numberOfCOs; coIdx++) {
              const configuredMax = examMaxMarks[coIdx] ?? 0;
              const studentCOMark = coMarksNum[coIdx] ?? 0;
              if (studentCOMark > configuredMax) {
                setError(`CO${coIdx + 1} mark for ${students[i].studentId} (${studentCOMark}) exceeds configured maximum of ${configuredMax}`);
                setSaving(false);
                return;
              }
            }
          }

          markData.coMarks = coMarksNum;
          markData.nonCoMark = nonCoMarkPayload;
        }

        // Validate Question marks if applicable
        if (numberOfQuestions > 0) {
          const questionMarksNum = entry.questionMarks.map(qm => {
            const val = qm.trim();
            return val ? parseInt(val) : 0;
          });

          // Check if all Question marks are valid
          if (questionMarksNum.some(qm => isNaN(qm) || qm < 0)) {
            setError(`Invalid Question marks for ${students[i].studentId}: Must be non-negative integers`);
            setSaving(false);
            return;
          }

          // Check if Question marks sum equals raw mark
          const questionMarksSum = questionMarksNum.reduce((sum, qm) => sum + qm, 0);
          if (questionMarksSum !== rawMarkNum) {
            setError(`Question marks for ${students[i].studentId} must sum to ${rawMarkNum}. Current sum: ${questionMarksSum}`);
            setSaving(false);
            return;
          }

          markData.questionMarks = questionMarksNum;
        }

        marksToSave.push(markData);
      }

      if (marksToSave.length === 0) {
        setError('No marks to save. Please enter at least one mark.');
        setSaving(false);
        return;
      }

      // Save all marks using bulk API or individual API calls
      let successCount = 0;
      for (const markData of marksToSave) {
        const response = await fetch('/api/marks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId,
            ...markData,
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          const data = await response.json();
          console.error(`Failed to save mark for student ${markData.studentId}:`, data.error);
        }
      }

      setSaving(false);
      
      if (successCount > 0) {
        notify.mark.bulkSaved(successCount);
        onMarksSaved();
        onClose();
      } else {
        notify.mark.bulkSaveError();
        setError('Failed to save marks. Please try again.');
      }
    } catch (err) {
      console.error('Error saving marks:', err);
      notify.mark.bulkSaveError();
      setError('An error occurred while saving marks');
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    // Count empty entries
    const emptyEntries = markEntries.filter(entry => !entry.rawMark.trim()).length;
    
    if (emptyEntries > 0) {
      setEmptyCount(emptyEntries);
      setShowEmptyDialog(true);
    } else {
      validateAndSave(false);
    }
  };

  const handleExamSelect = (examId: string) => {
    setSelectedExamId(examId);
    setError('');
    // Check if CO warning should be shown
    const exam = exams.find(e => e._id === examId);
    if (exam && exam.numberOfCOs && exam.numberOfCOs > 0) {
      const maxMarks = coPoMaxMarks[examId];
      const configured = maxMarks && maxMarks.slice(0, exam.numberOfCOs).some(m => m > 0);
      const ignored = ignoredCoWarnings.has(examId);
      setShowCoWarning(!configured && !ignored);
    } else {
      setShowCoWarning(false);
    }
  };

  const handleClose = () => {
    setSelectedExamId('');
    setMarkEntries([]);
    setError('');
    setShowEmptyDialog(false);
    setShowCoWarning(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-gradient-to-br from-gray-800 to-gray-800/80 rounded-2xl shadow-2xl w-full max-w-[95vw] h-[90vh] border border-gray-700/50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-100">Sequential Mark Entry</h2>
            <p className="text-sm text-gray-400 mt-1">
              {selectedExam ? `${selectedExam.displayName} - ${students.length} students` : 'Select an exam to begin'}
            </p>
          </div>
          <Button
            onClick={handleClose}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Exam Selection */}
        {!selectedExamId && (
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Select an exam:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {exams.map(exam => {
                const examMarks = marks.filter(m => m.examId === exam._id).length;
                const hasCOs = (exam.numberOfCOs ?? 0) > 0;
                const maxMarks = coPoMaxMarks[exam._id];
                const coConfigured = !hasCOs || (maxMarks && maxMarks.slice(0, exam.numberOfCOs).some(m => m > 0));
                const coIgnored = ignoredCoWarnings.has(exam._id);
                const showCoChip = hasCOs && !coConfigured && !coIgnored;
                return (
                  <button
                    key={exam._id}
                    onClick={() => handleExamSelect(exam._id)}
                    className="p-4 rounded-lg border-2 border-gray-600 bg-gray-900/50 hover:border-gray-500 transition-all text-left relative"
                  >
                    <div className="font-semibold text-gray-100">{exam.displayName}</div>
                    <div className="text-sm text-gray-400 mt-1">
                      Total: {exam.totalMarks} marks
                      {exam.numberOfCOs && ` • ${exam.numberOfCOs} COs`}
                      {exam.numberOfQuestions && ` • ${exam.numberOfQuestions} Questions`}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {examMarks}/{students.length} students entered
                    </div>
                    {showCoChip && (
                      <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        CO marks not set
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Mark Entry Table */}
        {selectedExamId && selectedExam && (
          <>
            <div className="flex-1 overflow-auto p-6">
              {/* CO Warning Banner (inline) */}
              {showCoWarning && (
                <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-amber-300 mb-1">CO Total Marks Not Configured</p>
                      <p className="text-xs text-amber-200/80 mb-3">
                        CO maximum marks are not set for <strong>{selectedExam.displayName}</strong> in CO-PO Mapping.
                        This may cause overflow in the final Course File output.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {onGoToCoPo && (
                          <button
                            onClick={() => { handleClose(); onGoToCoPo(); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-amber-950 transition-colors"
                          >
                            <ArrowRight className="w-3 h-3" />
                            Go to CO-PO Mapping
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setShowCoWarning(false);
                            onIgnoreCOWarning?.(selectedExamId);
                          }}
                          className="px-3 py-1.5 rounded text-xs text-amber-400/80 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 transition-colors"
                        >
                          Ignore for this session
                        </button>
                        <button
                          onClick={() => setShowCoWarning(false)}
                          className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-gray-200 border border-gray-600 hover:border-gray-500 transition-colors"
                        >
                          Continue anyway
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
                  {error}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-700 rounded-lg">
                  <thead className="bg-gray-900 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300 border-b border-gray-700 w-48">
                        Student
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-300 border-b border-gray-700 w-32">
                        Raw Mark
                        <div className="text-[10px] font-normal mt-0.5 text-gray-500">Max: {selectedExam.totalMarks}</div>
                      </th>
                      {numberOfCOs > 0 && Array.from({ length: numberOfCOs }, (_, i) => {
                        const coMax = coPoMaxMarks[selectedExamId]?.[i];
                        const hasMax = coMax !== undefined && coMax > 0;
                        return (
                          <th key={`co-${i}`} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-300 border-b border-gray-700 w-24">
                            CO{i + 1}
                            {hasMax && (
                              <div className="text-[10px] font-normal mt-0.5 text-emerald-500/80">Max: {coMax}</div>
                            )}
                          </th>
                        );
                      })}
                      {numberOfCOs > 0 && (
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-300 border-b border-gray-700 w-32">
                          Non-CO <div className="text-[10px] font-normal lowercase text-gray-500 mt-0.5">(Optional)</div>
                        </th>
                      )}
                      {numberOfCOs > 0 && (
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-300 border-b border-gray-700 w-28">
                          Remaining
                          <div className="text-[10px] font-normal lowercase text-gray-500 mt-0.5">to distribute</div>
                        </th>
                      )}
                      {numberOfQuestions > 0 && Array.from({ length: numberOfQuestions }, (_, i) => (
                        <th key={`q-${i}`} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-300 border-b border-gray-700 w-24">
                          Q{i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {students.map((student, studentIndex) => (
                      <tr key={student._id} className={`transition-colors hover:bg-gray-700/30 ${studentIndex % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-800/30'}`}>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-blue-300">{student.studentId}</div>
                          <div className="text-xs text-gray-400">{student.name}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <input
                            ref={(el) => {
                              inputRefs.current[getFieldKey(studentIndex, 'rawMark')] = el;
                            }}
                            type="number"
                            min="0"
                            max={selectedExam.totalMarks}
                            step="0.01"
                            value={markEntries[studentIndex]?.rawMark || ''}
                            onChange={(e) => updateMarkEntry(studentIndex, 'rawMark', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, studentIndex, 'rawMark')}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 text-center"
                            placeholder="0"
                          />
                        </td>
                        {numberOfCOs > 0 && Array.from({ length: numberOfCOs }, (_, coIndex) => {
                          const coMax = coPoMaxMarks[selectedExamId]?.[coIndex];
                          const hasMax = coMax !== undefined && coMax > 0;
                          const enteredVal = parseFloat(markEntries[studentIndex]?.coMarks[coIndex] || '0') || 0;
                          const isOverMax = hasMax && enteredVal > coMax;
                          return (
                            <td key={`co-${coIndex}`} className="px-4 py-3 text-sm">
                              <input
                                ref={(el) => {
                                  inputRefs.current[getFieldKey(studentIndex, 'co', coIndex)] = el;
                                }}
                                type="number"
                                min="0"
                                max={hasMax ? coMax : undefined}
                                step="0.01"
                                value={markEntries[studentIndex]?.coMarks[coIndex] || ''}
                                onChange={(e) => updateMarkEntry(studentIndex, 'co', e.target.value, coIndex)}
                                onKeyDown={(e) => handleKeyDown(e, studentIndex, 'co', coIndex)}
                                className={`w-full px-3 py-2 bg-gray-900 border rounded-lg focus:ring-2 focus:border-transparent text-gray-100 text-center ${
                                  isOverMax
                                    ? 'border-amber-500 focus:ring-amber-500 text-amber-300'
                                    : 'border-gray-600 focus:ring-blue-500'
                                }`}
                                placeholder="0"
                                title={hasMax ? `Max: ${coMax}` : undefined}
                              />
                            </td>
                          );
                        })}
                        {numberOfCOs > 0 && (() => {
                          const rawVal = parseFloat(markEntries[studentIndex]?.rawMark || '0') || 0;
                          const coSum = (markEntries[studentIndex]?.coMarks || []).reduce((s, cm) => s + (parseFloat(cm) || 0), 0);
                          const nonCoVal = parseFloat(markEntries[studentIndex]?.nonCoMark || '0') || 0;
                          const remaining = rawVal - coSum - nonCoVal;
                          const hasRawMark = !!markEntries[studentIndex]?.rawMark;
                          const isExact = Math.abs(remaining) < 0.01;
                          const isOver = remaining < -0.01;
                          return (
                            <>
                              <td className="px-4 py-3 text-sm">
                                <input
                                  ref={(el) => {
                                    inputRefs.current[getFieldKey(studentIndex, 'nonCo')] = el;
                                  }}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={markEntries[studentIndex]?.nonCoMark || ''}
                                  onChange={(e) => updateMarkEntry(studentIndex, 'nonCo', e.target.value)}
                                  onKeyDown={(e) => handleKeyDown(e, studentIndex, 'nonCo')}
                                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 text-center"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                {hasRawMark ? (
                                  <span className={`inline-flex items-center justify-center min-w-[52px] px-2 py-1 rounded-full text-xs font-bold tabular-nums ${
                                    isExact
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                      : isOver
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                        : 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                                  }`}>
                                    {isExact ? '✓ 0' : isOver ? `−${Math.abs(remaining).toFixed(1)}` : `+${remaining.toFixed(1)}`}
                                  </span>
                                ) : (
                                  <span className="text-gray-600 text-xs">—</span>
                                )}
                              </td>
                            </>
                          );
                        })()}
                        {numberOfQuestions > 0 && Array.from({ length: numberOfQuestions }, (_, qIndex) => (
                          <td key={`q-${qIndex}`} className="px-4 py-3 text-sm">
                            <input
                              ref={(el) => {
                                inputRefs.current[getFieldKey(studentIndex, 'q', qIndex)] = el;
                              }}
                              type="number"
                              min="0"
                              step="1"
                              value={markEntries[studentIndex]?.questionMarks[qIndex] || ''}
                              onChange={(e) => updateMarkEntry(studentIndex, 'q', e.target.value, qIndex)}
                              onKeyDown={(e) => handleKeyDown(e, studentIndex, 'q', qIndex)}
                              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-100 text-center"
                              placeholder="0"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <p className="text-sm text-blue-300">
                  💡 <strong>Navigation:</strong> Press Tab or Enter to move to the next field. Press Shift+Tab to go back.
                </p>
                {(numberOfCOs > 0 || numberOfQuestions > 0) && (
                  <p className="text-xs text-blue-400 mt-2">
                    ⚠️ {numberOfCOs > 0 && 'CO marks must sum to the Raw Mark.'} {numberOfQuestions > 0 && 'Question marks must sum to the Raw Mark.'}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-700 flex gap-3">
              <Button
                onClick={() => setSelectedExamId('')}
                variant="outline"
                className="flex-1"
              >
                ← Change Exam
              </Button>
              <Button
                onClick={handleSaveClick}
                disabled={saving}
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
                    Save All Marks
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Empty Fields Dialog */}
      {showEmptyDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110]">
          <div className="bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 border border-gray-700 p-6">
            <h3 className="text-xl font-bold text-gray-100 mb-4">⚠️ Empty Fields Detected</h3>
            <p className="text-gray-300 mb-6">
              {emptyCount} student(s) have empty marks. What would you like to do?
            </p>
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => {
                  setShowEmptyDialog(false);
                  validateAndSave(true);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Fill Empty with 0
              </Button>
              <Button
                onClick={() => {
                  setShowEmptyDialog(false);
                  validateAndSave(false);
                }}
                variant="outline"
                className="w-full"
              >
                Leave Empty (Skip)
              </Button>
              <Button
                onClick={() => setShowEmptyDialog(false)}
                variant="ghost"
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
