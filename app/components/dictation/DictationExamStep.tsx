'use client';

import { DictationExam, DictationMark, DictationStudent } from './types';

interface DictationExamStepProps {
  exams: DictationExam[];
  students: DictationStudent[];
  marks: DictationMark[];
  onSelect: (examId: string) => void;
}

/** Step 1: pick which exam this dictation session will enter marks for. */
export default function DictationExamStep({ exams, students, marks, onSelect }: DictationExamStepProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-200 mb-4">Select an exam to dictate marks for:</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {exams.map(exam => {
          const examMarks = marks.filter(m => m.examId === exam._id).length;
          return (
            <button
              key={exam._id}
              onClick={() => onSelect(exam._id)}
              className="p-4 rounded-lg border-2 border-gray-600 bg-gray-900/50 hover:border-purple-500 text-left transition-all"
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
  );
}
