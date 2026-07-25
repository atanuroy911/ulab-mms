'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { notify } from '@/app/utils/notifications';
import { useDictation } from '@/app/utils/useDictation';
import { detectCommand, parseFieldDirective, parseSpokenNumber } from '@/app/utils/speechDictation';
import DictationExamStep from './DictationExamStep';
import DictationStudentStep from './DictationStudentStep';
import DictationValueStep from './DictationValueStep';
import DictationConfirmStep from './DictationConfirmStep';
import { DictationExam, DictationMark, DictationStudent, DraftMarkEntry, emptyDraft } from './types';

type Step = 'exam' | 'student' | 'raw' | `co-${number}` | 'nonco' | 'confirm';

interface DictationMarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: DictationStudent[];
  exams: DictationExam[];
  marks: DictationMark[];
  courseId: string;
  onMarkSaved: () => void;
}

export default function DictationMarkModal({
  isOpen,
  onClose,
  students,
  exams,
  marks,
  courseId,
  onMarkSaved,
}: DictationMarkModalProps) {
  const [examId, setExamId] = useState<string>('');
  const [step, setStep] = useState<Step>('exam');
  const [studentQuery, setStudentQuery] = useState('');
  const [draft, setDraft] = useState<DraftMarkEntry>(emptyDraft(0));
  const [saving, setSaving] = useState(false);

  const stepRef = useRef<Step>(step);
  stepRef.current = step;
  const studentQueryRef = useRef(studentQuery);
  studentQueryRef.current = studentQuery;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const exam = exams.find(e => e._id === examId);
  const numberOfCOs = exam?.numberOfCOs || 0;
  const selectedStudent = students.find(s => s._id === draft.studentId);

  const handleFinalTranscript = (transcript: string) => {
    const command = detectCommand(transcript);
    const currentStep = stepRef.current;

    if (currentStep === 'student') {
      if (command === 'next') {
        confirmTopStudentMatch();
        return;
      }
      const newQuery = (studentQueryRef.current ? `${studentQueryRef.current} ${transcript}` : transcript).trim();
      setStudentQuery(newQuery);
      // Speech recognition sometimes drops spaces between ID digits at odd
      // spots - ignore spacing entirely and look for an exact ID match so
      // long IDs confirm instantly without needing "next".
      const stripped = newQuery.replace(/\s+/g, '').toLowerCase();
      const exactMatch = students.find(s => s.studentId.replace(/\s+/g, '').toLowerCase() === stripped);
      if (exactMatch) selectStudent(exactMatch._id);
      return;
    }

    if (command === 'next') {
      advanceFromValueStep();
      return;
    }
    if (command === 'back') {
      goBack();
      return;
    }
    if (command === 'repeat') {
      setValueForStep(currentStep, '');
      return;
    }

    // A field-naming phrase ("CO1 is 24") can target any field, not just the
    // one currently focused - lets fields be spoken in any order.
    const directive = parseFieldDirective(transcript);
    if (directive) {
      setValueForStep(directive.field as Step, directive.value);
      return;
    }

    const num = parseSpokenNumber(transcript);
    if (num !== null) {
      setValueForStep(currentStep, String(num));
    }
  };

  const dictation = useDictation({ onFinalResult: handleFinalTranscript });

  // Stop listening whenever we land on a non-voice step (exam picker, confirm screen).
  useEffect(() => {
    if (step === 'exam' || step === 'confirm') {
      dictation.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (!isOpen) {
      dictation.stop();
      setExamId('');
      setStep('exam');
      resetStudentEntry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function resetStudentEntry() {
    setStudentQuery('');
    setDraft(emptyDraft(numberOfCOs));
  }

  function setValueForStep(targetStep: Step, value: string) {
    setDraft(prev => {
      if (targetStep === 'raw') return { ...prev, rawMark: value };
      if (targetStep === 'nonco') return { ...prev, nonCoMark: value };
      if (targetStep.startsWith('co-')) {
        const idx = parseInt(targetStep.split('-')[1], 10);
        const coMarks = [...prev.coMarks];
        coMarks[idx] = value;
        return { ...prev, coMarks };
      }
      return prev;
    });
  }

  function firstValueStep(): Step {
    return 'raw';
  }

  function nextStepAfter(currentStep: Step): Step {
    if (currentStep === 'raw') {
      return numberOfCOs > 0 ? 'co-0' : 'confirm';
    }
    if (currentStep.startsWith('co-')) {
      const idx = parseInt(currentStep.split('-')[1], 10);
      return idx < numberOfCOs - 1 ? (`co-${idx + 1}` as Step) : 'nonco';
    }
    if (currentStep === 'nonco') return 'confirm';
    return 'confirm';
  }

  function prevStepBefore(currentStep: Step): Step {
    if (currentStep === 'raw') return 'student';
    if (currentStep === 'nonco') return numberOfCOs > 0 ? (`co-${numberOfCOs - 1}` as Step) : 'raw';
    if (currentStep.startsWith('co-')) {
      const idx = parseInt(currentStep.split('-')[1], 10);
      return idx > 0 ? (`co-${idx - 1}` as Step) : 'raw';
    }
    return 'student';
  }

  function advanceFromValueStep() {
    setStep(prev => nextStepAfter(prev));
  }

  function goBack() {
    setStep(prev => (prev === 'confirm' ? prevStepBefore('nonco') : prevStepBefore(prev)));
  }

  function confirmTopStudentMatch() {
    const query = studentQueryRef.current;
    const filtered = students.filter(
      s => s.studentId.toLowerCase().includes(query.toLowerCase()) || s.name.toLowerCase().includes(query.toLowerCase())
    );
    if (filtered[0]) selectStudent(filtered[0]._id);
  }

  function selectStudent(studentId: string) {
    const existing = marks.find(m => m.studentId === studentId && m.examId === examId);
    setDraft({
      studentId,
      rawMark: existing ? String(existing.rawMark) : '',
      coMarks: new Array(numberOfCOs).fill(''),
      nonCoMark: '',
    });
    setStudentQuery('');
    setStep(firstValueStep());
  }

  function handleExamSelect(id: string) {
    setExamId(id);
    resetStudentEntry();
    setStep('student');
  }

  async function handleSave() {
    if (!selectedStudent || !exam) return;
    setSaving(true);
    try {
      const rawMarkNum = parseFloat(draft.rawMark || '0');
      const coMarksArray = numberOfCOs > 0 ? draft.coMarks.map(v => parseFloat(v || '0')) : undefined;
      const nonCoMarkNum = draft.nonCoMark.trim() !== '' ? parseFloat(draft.nonCoMark) : null;

      const response = await fetch('/api/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          studentId: selectedStudent._id,
          examId: exam._id,
          rawMark: rawMarkNum,
          coMarks: coMarksArray,
          nonCoMark: nonCoMarkNum,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        notify.mark.added(selectedStudent.name, exam.displayName);
        onMarkSaved();
        resetStudentEntry();
        setStep('student');
      } else {
        notify.mark.addError(data.error);
      }
    } catch {
      notify.mark.addError();
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-100 p-4" onClick={onClose}>
      <div
        className="bg-linear-to-br from-gray-800 to-gray-800/80 rounded-2xl shadow-2xl max-w-2xl w-full border border-gray-700/50 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-600 text-white font-bold text-lg">α</span>
            <h2 className="text-2xl font-bold text-gray-100">Add Marks via Dictation</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!dictation.supported && (
          <div className="mb-4 flex items-start gap-3 p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg text-amber-300 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{dictation.supportNote}</span>
          </div>
        )}
        {dictation.supported && dictation.supportNote && (
          <div className="mb-4 text-xs text-amber-300/80 text-center">{dictation.supportNote}</div>
        )}

        <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
          {step === 'exam' && (
            <DictationExamStep exams={exams} students={students} marks={marks} onSelect={handleExamSelect} />
          )}

          {step === 'student' && (
            <DictationStudentStep
              students={students}
              query={studentQuery}
              onQueryChange={setStudentQuery}
              onConfirm={selectStudent}
              listening={dictation.listening}
              interimTranscript={dictation.interimTranscript}
              onToggleMic={dictation.listening ? dictation.stop : dictation.start}
            />
          )}

          {step === 'raw' && exam && selectedStudent && (
            <DictationValueStep
              title={`Raw mark for ${selectedStudent.studentId}`}
              subtitle={`${selectedStudent.name} — max ${exam.totalMarks}`}
              value={draft.rawMark}
              onValueChange={(v) => setValueForStep('raw', v)}
              listening={dictation.listening}
              interimTranscript={dictation.interimTranscript}
              onToggleMic={dictation.listening ? dictation.stop : dictation.start}
              maxValue={exam.totalMarks}
            />
          )}

          {step.startsWith('co-') && exam && selectedStudent && (
            <DictationValueStep
              title={`CO${parseInt(step.split('-')[1], 10) + 1} mark`}
              subtitle='Say a number, or "zero"/"skip" if none'
              value={draft.coMarks[parseInt(step.split('-')[1], 10)] || ''}
              onValueChange={(v) => setValueForStep(step, v)}
              listening={dictation.listening}
              interimTranscript={dictation.interimTranscript}
              onToggleMic={dictation.listening ? dictation.stop : dictation.start}
            />
          )}

          {step === 'nonco' && (
            <DictationValueStep
              title="Non-CO mark"
              subtitle='Say a number, or "zero"/"skip" if none'
              value={draft.nonCoMark}
              onValueChange={(v) => setValueForStep('nonco', v)}
              listening={dictation.listening}
              interimTranscript={dictation.interimTranscript}
              onToggleMic={dictation.listening ? dictation.stop : dictation.start}
            />
          )}

          {step === 'confirm' && exam && selectedStudent && (
            <DictationConfirmStep
              exam={exam}
              student={selectedStudent}
              draft={draft}
              onEditRaw={(v) => setValueForStep('raw', v)}
              onEditCo={(i, v) => setValueForStep(`co-${i}`, v)}
              onEditNonCo={(v) => setValueForStep('nonco', v)}
              onRedoField={(field) => setStep(field)}
              onSave={handleSave}
              onBack={() => setStep(numberOfCOs > 0 ? 'nonco' : 'raw')}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}
