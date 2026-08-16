'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, ChevronDown, Search } from 'lucide-react';
import COMarksWarningBanner from './COMarksWarningBanner';

interface Student {
  _id: string;
  studentId: string;
  name: string;
  withdrawn?: boolean;
}

interface Exam {
  _id: string;
  displayName: string;
  totalMarks: number;
  examCategory?: string;
}

interface Mark {
  _id: string;
  studentId: string;
  examId: string;
  rawMark: number;
}

interface ExamRef {
  _id: string;
  displayName: string;
}

interface MarksViewProps {
  students: Student[];
  exams: Exam[];
  marks: Mark[];
  getMark: (studentId: string, examId: string) => Mark | undefined;
  onShowMarkModal: (examId: string | undefined, studentId: string | undefined) => void;
  onShowBulkMarkModal: () => void;
  onShowBulkPasteModal: () => void;
  onShowDictationModal: () => void;
  onShowSetZeroModal: () => void;
  onShowResetMarksModal: () => void;
  onAutoAttendanceMarks: (examId: string) => void;
  isAutoCalculatingAttendance?: boolean;
  onGetProjectMarks?: (() => void) | null;
  isGettingProjectMarks?: boolean;
  courseType?: 'Theory' | 'Lab';
  // CO warning props
  examsWithMissingCO?: ExamRef[];
  onGoToCoPo?: () => void;
  onIgnoreCOWarning?: () => void;
}

export default function MarksView({
  students,
  exams,
  marks,
  getMark,
  onShowMarkModal,
  onShowBulkMarkModal,
  onShowBulkPasteModal,
  onShowDictationModal,
  onShowSetZeroModal,
  onShowResetMarksModal,
  onAutoAttendanceMarks,
  isAutoCalculatingAttendance = false,
  onGetProjectMarks = null,
  isGettingProjectMarks = false,
  courseType = 'Theory',
  examsWithMissingCO = [],
  onGoToCoPo,
  onIgnoreCOWarning,
}: MarksViewProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showFloatingButtons, setShowFloatingButtons] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Show floating buttons on scroll
  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingButtons(window.scrollY > 200);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (students.length === 0 || exams.length === 0) {
    return null;
  }

  const attendanceExams = exams.filter(e => e.examCategory === 'Attendance');
  const hasProjectExam = exams.some(e => e.examCategory === 'Project');

  const filteredStudents = search.trim()
    ? students.filter(s =>
        s.studentId.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase())
      )
    : students;

  return (
    <div className="space-y-6">
      {/* CO Warning Banner */}
      {examsWithMissingCO.length > 0 && onGoToCoPo && onIgnoreCOWarning && (
        <COMarksWarningBanner
          examsWithMissingCO={examsWithMissingCO}
          onGoToCoPo={onGoToCoPo}
          onIgnore={onIgnoreCOWarning}
        />
      )}

      <div>
        <h1 className="text-3xl font-bold">Marks Management</h1>
        <p className="text-sm mt-1 text-muted-foreground">
          Add and manage marks for {students.length} student(s) across {exams.length} exam(s). Click on each mark to add or edit.
        </p>
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className="relative" ref={dropdownRef}>
          <Button
            onClick={() => setShowDropdown(!showDropdown)}
            className="gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Mark
            <ChevronDown className="w-4 h-4 ml-1" />
          </Button>
          
          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-popover border rounded-lg shadow-lg z-50 overflow-hidden">
              <button
                onClick={() => {
                  setShowDropdown(false);
                  onShowBulkMarkModal();
                }}
                className="w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3 border-b"
              >
                <span className="text-xl">📊</span>
                <div>
                  <div className="font-medium">Add All (Sequential)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Excel-like entry for all students
                  </div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowDropdown(false);
                  onShowMarkModal(undefined, undefined);
                }}
                className="w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3 border-b"
              >
                <span className="text-xl">🔍</span>
                <div>
                  <div className="font-medium">Add Individual (Filter)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Search and add one at a time
                  </div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowDropdown(false);
                  onShowBulkPasteModal();
                }}
                className="w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3 border-b"
              >
                <span className="text-xl">📋</span>
                <div>
                  <div className="font-medium">Bulk Paste (ID + Marks)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Paste rows exported from Google Classroom
                  </div>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowDropdown(false);
                  onShowDictationModal();
                }}
                className="w-full px-4 py-3 text-left hover:bg-accent transition-colors flex items-start gap-3"
              >
                <span className="flex items-center justify-center w-6 h-6 rounded bg-purple-600 text-white font-bold text-sm shrink-0">α</span>
                <div>
                  <div className="font-medium">Add Marks via Dictation</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Speak student ID and marks, one at a time
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
        <Button
          onClick={onShowSetZeroModal}
          variant="outline"
          className="gap-2 border-blue-500/50 hover:bg-blue-500/10"
        >
          <span>0️⃣</span>
          Set Empty Marks to 0
        </Button>
        {attendanceExams.map(exam => (
          <Button
            key={`auto-att-${exam._id}`}
            onClick={() => onAutoAttendanceMarks(exam._id)}
            variant="outline"
            className="gap-2 border-green-500/50 hover:bg-green-500/10"
            disabled={isAutoCalculatingAttendance}
          >
            <span>📈</span>
            {isAutoCalculatingAttendance ? 'Calculating...' : `Auto ${exam.displayName}`}
          </Button>
        ))}
        <Button
          onClick={onShowResetMarksModal}
          variant="outline"
          className="gap-2 border-red-500/50 hover:bg-red-500/10"
        >
          <Trash2 className="w-4 h-4" />
          Reset Marks
        </Button>
        {hasProjectExam && onGetProjectMarks && (
          <Button
            onClick={onGetProjectMarks}
            variant="outline"
            className="gap-2 border-violet-500/50 hover:bg-violet-500/10"
            disabled={isGettingProjectMarks}
          >
            <span>🎯</span>
            {isGettingProjectMarks ? 'Pulling marks...' : `Get marks from ${courseType === 'Lab' ? 'OEL / CE Project' : 'Project'} tab`}
          </Button>
        )}
      </div>
      <div className="sticky top-0 z-30 -mx-6 px-6 py-3 bg-background/95 backdrop-blur-md border-b border-border/60">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or ID..."
            className="pl-9"
          />
        </div>
      </div>
      <Card className="p-6">
        <div className="overflow-x-auto max-h-[calc(100vh-200px)] sticky top-0">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted sticky top-0 z-20">
              <tr>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider sticky left-0 z-30 bg-muted border-r w-[50px]">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider sticky left-0 z-30 bg-muted border-r min-w-[200px]">Student</th>
                {exams.map(exam => (
                  <th key={exam._id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    <div>{exam.displayName}</div>
                    <div className="text-[10px] font-normal mt-0.5 text-muted-foreground">{exam.totalMarks} marks</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={exams.length + 2} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No students match &quot;{search}&quot;
                  </td>
                </tr>
              )}
              {filteredStudents.map((student, idx) => (
                <tr key={student._id} className={`transition-colors hover:bg-muted/50 ${idx % 2 === 0 ? 'bg-muted/20' : 'bg-background'}`}>
                  <td className={`px-3 py-3 text-sm font-medium text-center sticky left-0 z-10 border-r w-[50px] ${idx % 2 === 0 ? 'bg-muted' : 'bg-background'}`}>{idx + 1}</td>
                  <td className={`px-4 py-3 text-sm font-medium sticky left-0 z-10 border-r min-w-[200px] ${idx % 2 === 0 ? 'bg-muted' : 'bg-background'}`}>
                    <div className="flex flex-col">
                      <span className="text-primary font-semibold">{student.studentId}</span>
                      <span className={`text-xs ${student.withdrawn ? 'text-amber-700 dark:text-yellow-400 font-semibold' : 'text-muted-foreground'}`}>
                        {student.name} {student.withdrawn && <span className="font-bold ml-1">(W)</span>}
                      </span>
                    </div>
                  </td>
                  {exams.map(exam => {
                    const mark = getMark(student._id, exam._id);
                    return (
                      <td key={exam._id} className={`px-4 py-3 text-sm`}>
                        <Button
                          onClick={() => onShowMarkModal(exam._id, student._id)}
                          variant={mark ? "secondary" : "outline"}
                          size="sm"
                          className="w-full justify-center"
                        >
                          {mark ? (
                            <span className="font-semibold">{mark.rawMark}</span>
                          ) : (
                            <span className="text-muted-foreground">+ Add</span>
                          )}
                        </Button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Floating Action Buttons */}
      {showFloatingButtons && (
        <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
          <Button
            onClick={onShowBulkMarkModal}
            className="gap-2 shadow-lg hover:shadow-xl transition-shadow"
            size="lg"
          >
            <Plus className="w-5 h-5" />
            Add All
          </Button>
          <Button
            onClick={onShowSetZeroModal}
            variant="secondary"
            className="gap-2 shadow-lg hover:shadow-xl transition-shadow"
            size="lg"
          >
            0️⃣
            Set Empty to 0
          </Button>
          <Button
            onClick={onShowResetMarksModal}
            variant="destructive"
            className="gap-2 shadow-lg hover:shadow-xl transition-shadow"
            size="lg"
          >
            <Trash2 className="w-5 h-5" />
            Reset Marks
          </Button>
          {attendanceExams.map(exam => (
            <Button
              key={`float-auto-att-${exam._id}`}
              onClick={() => onAutoAttendanceMarks(exam._id)}
              variant="outline"
              className="gap-2 shadow-lg hover:shadow-xl transition-shadow border-green-500/50 hover:bg-green-500/10 bg-background"
              size="lg"
              disabled={isAutoCalculatingAttendance}
            >
              <span>📈</span>
              {isAutoCalculatingAttendance ? '...' : `Auto ${exam.displayName}`}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
