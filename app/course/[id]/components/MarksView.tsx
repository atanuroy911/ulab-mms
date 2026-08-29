'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, ChevronDown, Search, MoreVertical, Settings, Equal, Gauge } from 'lucide-react';
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
  onShowBulkMarkModal: (examId?: string) => void;
  onShowBulkPasteModal: () => void;
  onShowDictationModal: () => void;
  onShowSetZeroModal: () => void;
  onShowResetMarksModal: (examId?: string) => void;
  onShowExamSettings?: (examId: string) => void;
  onShowSetColumnMarkModal?: (examId: string) => void;
  onShowStatisticsModal?: () => void;
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
  onShowExamSettings,
  onShowSetColumnMarkModal,
  onShowStatisticsModal,
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
  const [openColumnMenu, setOpenColumnMenu] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const columnMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setOpenColumnMenu(null);
      }
    };

    if (showDropdown || openColumnMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown, openColumnMenu]);

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

  // Group columns the same way the Exams tab groups exam cards, so the two views read consistently.
  const CATEGORY_ORDER: { key: string; label: string }[] = [
    { key: 'MainExam', label: 'Main Exams' },
    { key: 'Quiz', label: 'Quizzes' },
    { key: 'Assignment', label: 'Assignments' },
    { key: 'Project', label: 'Project' },
    { key: 'ClassPerformance', label: 'Class Performance' },
    { key: 'Attendance', label: 'Attendance' },
    { key: 'Others', label: 'Others' },
  ];
  const examGroups = CATEGORY_ORDER
    .map(({ key, label }) => ({
      key,
      label,
      exams: exams.filter(e => (e.examCategory || 'Others') === key),
    }))
    .filter(group => group.exams.length > 0);
  const orderedExams = examGroups.flatMap(group => group.exams);

  const filteredStudents = search.trim()
    ? students.filter(s =>
        s.studentId.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase())
      )
    : students;

  return (
    <div className="space-y-6 pb-24 sm:pb-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
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
          onClick={() => onShowResetMarksModal()}
          variant="outline"
          className="gap-2 border-red-500/50 hover:bg-red-500/10"
        >
          <Trash2 className="w-4 h-4" />
          Reset Marks
        </Button>
        {onShowStatisticsModal && (
          <Button
            onClick={onShowStatisticsModal}
            variant="outline"
            className="gap-2 border-primary/50 hover:bg-primary/10"
          >
            <Gauge className="w-4 h-4" />
            Statistics
          </Button>
        )}
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
      <div className="hidden sm:block sticky top-0 z-30 -mx-6 px-6 py-3 bg-background/95 backdrop-blur-md border-b border-border/60">
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

      {/* Mobile floating search — fixed to viewport so filtering/scrolling never disturbs its position */}
      <div className="sm:hidden fixed bottom-4 inset-x-4 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="relative rounded-full border border-border/50 bg-background/80 backdrop-blur-xl shadow-lg shadow-black/10">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or ID..."
            className="pl-11 h-12 rounded-full border-0 bg-transparent shadow-none focus-visible:ring-2"
          />
        </div>
      </div>

      <Card className="p-6">
        <div className="overflow-x-auto max-h-[calc(100vh-200px)] sticky top-0">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted sticky top-0 z-20">
              <tr>
                <th rowSpan={2} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider sticky left-0 z-30 bg-muted border-r w-[50px] align-middle">#</th>
                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider sticky left-0 z-30 bg-muted border-r min-w-[200px] align-middle">Student</th>
                {examGroups.map((group, gIdx) => (
                  <th
                    key={group.key}
                    colSpan={group.exams.length}
                    className={`px-4 py-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/60 border-b ${gIdx > 0 ? 'border-l-2 border-border' : ''}`}
                  >
                    {group.label}
                  </th>
                ))}
              </tr>
              <tr>
                {examGroups.map((group, gIdx) =>
                  group.exams.map((exam, eIdx) => {
                    const enteredCount = marks.filter(m => m.examId === exam._id).length;
                    const remainingCount = students.length - enteredCount;
                    const isGroupStart = gIdx > 0 && eIdx === 0;
                    return (
                      <th
                        key={exam._id}
                        className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider align-top ${isGroupStart ? 'border-l-2 border-border' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <div>{exam.displayName}</div>
                            <div className="text-[10px] font-normal mt-0.5 text-muted-foreground">{exam.totalMarks} marks</div>
                            <div className={`text-[10px] font-normal mt-0.5 ${remainingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {remainingCount > 0 ? `${remainingCount} remaining` : 'All entered'}
                            </div>
                          </div>
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={() => setOpenColumnMenu(openColumnMenu === exam._id ? null : exam._id)}
                              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              aria-label={`Options for ${exam.displayName}`}
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                            {openColumnMenu === exam._id && (
                              <div
                                ref={columnMenuRef}
                                className="absolute right-0 mt-1 w-48 bg-popover border rounded-lg shadow-lg z-50 overflow-hidden normal-case font-normal"
                              >
                                <button
                                  onClick={() => {
                                    setOpenColumnMenu(null);
                                    onShowBulkMarkModal(exam._id);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-accent transition-colors flex items-center gap-2"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Bulk grade this column
                                </button>
                                {onShowSetColumnMarkModal && (
                                  <button
                                    onClick={() => {
                                      setOpenColumnMenu(null);
                                      onShowSetColumnMarkModal(exam._id);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs hover:bg-accent transition-colors flex items-center gap-2"
                                  >
                                    <Equal className="w-3.5 h-3.5" />
                                    Set all marks to...
                                  </button>
                                )}
                                {onShowExamSettings && (
                                  <button
                                    onClick={() => {
                                      setOpenColumnMenu(null);
                                      onShowExamSettings(exam._id);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs hover:bg-accent transition-colors flex items-center gap-2"
                                  >
                                    <Settings className="w-3.5 h-3.5" />
                                    Edit marks distribution
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setOpenColumnMenu(null);
                                    onShowResetMarksModal(exam._id);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-accent text-destructive transition-colors flex items-center gap-2"
                                  disabled={enteredCount === 0}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Remove marks for this column
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </th>
                    );
                  })
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={orderedExams.length + 2} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
                  {examGroups.map((group, gIdx) =>
                    group.exams.map((exam, eIdx) => {
                    const mark = getMark(student._id, exam._id);
                    const isGroupStart = gIdx > 0 && eIdx === 0;
                    return (
                      <td key={exam._id} className={`px-4 py-3 text-sm ${isGroupStart ? 'border-l-2 border-border' : ''}`}>
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
                  })
                  )}
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
            onClick={() => onShowBulkMarkModal()}
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
            onClick={() => onShowResetMarksModal()}
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
