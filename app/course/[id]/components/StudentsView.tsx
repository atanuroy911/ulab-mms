'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Plus, Upload, Trash2, Tag, Search, MoreVertical, ChevronDown, UserX, UserCheck, Pencil } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

interface Student {
  _id: string;
  studentId: string;
  name: string;
  withdrawn?: boolean;
  useAlias?: boolean;
}

interface Exam {
  _id: string;
  displayName: string;
  totalMarks: number;
  weightage: number;
  examCategory?: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others';
}

interface Mark {
  _id: string;
  studentId: string;
  examId: string;
  rawMark: number;
  weightedMark?: number;
}

interface Course {
  _id: string;
  name: string;
  code: string;
  quizAggregation?: 'average' | 'best';
  assignmentAggregation?: 'average' | 'best' | 'sum';
  quizWeightage?: number;
  assignmentWeightage?: number;
  projectWeightage?: number;
  gradingScale?: string;
  courseType?: string;
  aliasEnabled?: boolean;
  alternateCode?: string;
}

interface GradeData {
  total: number;
  breakdown: Array<{
    name: string;
    mark: number;
    totalMarks: number;
    weightage: number;
    contribution: number;
    isAggregated?: boolean;
  }>;
}

interface LetterGrade {
  letter: string;
  modifier?: string;
}

interface StudentsViewProps {
  students: Student[];
  exams: Exam[];
  marks: Mark[];
  course: Course;
  hasQuizzes: boolean;
  hasAssignments: boolean;
  hasProjects: boolean;
  getMark: (studentId: string, examId: string) => Mark | undefined;
  getAggregatedMark: (studentId: string, category: 'Quiz' | 'Assignment') => Mark | { rawMark: number; isAggregated: boolean; examId?: string } | null;
  getProjectAggregatedMark: (studentId: string) => { rawMark: number; sumRaw: number; sumTotal: number; isAggregated: boolean } | null;
  calculateFinalGrade: (studentId: string) => GradeData;
  calculateLetterGrade: (percentage: number, gradingScale?: string) => LetterGrade | null;
  getGradeDisplay: (letter: string, modifier?: string) => string;
  getGradeColor: (letter: string) => string;
  getGradeBgColor: (letter: string) => string;
  onShowAddStudentModal: () => void;
  onShowBulkAddStudentModal: () => void;
  onEditStudent: (student: Student) => void;
  onShowStudentDetail: (student: Student) => void;
  onShowGradeBreakdown: (student: Student) => void;
  onDeleteStudent: (student: Student) => void;
  onDeleteAllStudents: () => Promise<void> | void;
  onBulkDeleteStudents?: (studentIds: string[]) => Promise<void> | void;
  onToggleWithdrawStudent: (student: Student) => void;
  onToggleAlias: (student: Student) => void;
  onBulkToggleWithdraw?: (studentIds: string[], withdrawn: boolean) => Promise<void> | void;
  onBulkToggleAlias?: (studentIds: string[], useAlias: boolean) => Promise<void> | void;
  onAutoCategorizeAlias: () => void;
}

export default function StudentsView({
  students,
  exams,
  marks,
  course,
  hasQuizzes,
  hasAssignments,
  hasProjects,
  getMark,
  getAggregatedMark,
  getProjectAggregatedMark,
  calculateFinalGrade,
  calculateLetterGrade,
  getGradeDisplay,
  getGradeColor,
  getGradeBgColor,
  onShowAddStudentModal,
  onShowBulkAddStudentModal,
  onEditStudent,
  onShowStudentDetail,
  onShowGradeBreakdown,
  onDeleteStudent,
  onDeleteAllStudents,
  onBulkDeleteStudents,
  onToggleWithdrawStudent,
  onToggleAlias,
  onBulkToggleWithdraw,
  onBulkToggleAlias,
  onAutoCategorizeAlias,
}: StudentsViewProps) {
  const [showFloatingButtons, setShowFloatingButtons] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllConfirmationStep, setDeleteAllConfirmationStep] = useState(0);
  const [deleteAllConfirmationText, setDeleteAllConfirmationText] = useState('');
  const [deletingAllStudents, setDeletingAllStudents] = useState(false);

  const [search, setSearch] = useState('');

  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteConfirmationStep, setBulkDeleteConfirmationStep] = useState(0);
  const [deletingBulkStudents, setDeletingBulkStudents] = useState(false);
  const [bulkActionPending, setBulkActionPending] = useState(false);

  const toggleStudentSelection = (studentId: string) => {
    const newSelected = new Set(selectedStudentIds);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudentIds(newSelected);
  };

  const filteredStudents = search.trim()
    ? students.filter(s =>
        s.studentId.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase())
      )
    : students;

  // Group columns the same way the Marks tab groups exam columns, so the two views read consistently.
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

  const toggleAllSelection = () => {
    if (selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map(s => s._id)));
    }
  };

  const resetBulkDeleteModal = () => {
    setShowBulkDeleteModal(false);
    setBulkDeleteConfirmationStep(0);
    setDeletingBulkStudents(false);
  };

  const handleBulkDeleteStudents = async () => {
    if (!onBulkDeleteStudents) return;
    setDeletingBulkStudents(true);
    try {
      await onBulkDeleteStudents(Array.from(selectedStudentIds));
      resetBulkDeleteModal();
      setSelectedStudentIds(new Set());
    } finally {
      setDeletingBulkStudents(false);
    }
  };

  const handleBulkWithdraw = async (withdrawn: boolean) => {
    if (!onBulkToggleWithdraw) return;
    setBulkActionPending(true);
    try {
      await onBulkToggleWithdraw(Array.from(selectedStudentIds), withdrawn);
      setSelectedStudentIds(new Set());
    } finally {
      setBulkActionPending(false);
    }
  };

  const handleBulkAlias = async (useAlias: boolean) => {
    if (!onBulkToggleAlias) return;
    setBulkActionPending(true);
    try {
      await onBulkToggleAlias(Array.from(selectedStudentIds), useAlias);
      setSelectedStudentIds(new Set());
    } finally {
      setBulkActionPending(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      // Show floating buttons when scrolled down more than 200px
      setShowFloatingButtons(window.scrollY > 200);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (students.length === 0) {
    return null;
  }

  const resetDeleteAllModal = () => {
    setShowDeleteAllModal(false);
    setDeleteAllConfirmationStep(0);
    setDeleteAllConfirmationText('');
    setDeletingAllStudents(false);
  };

  const handleDeleteAllStudents = async () => {
    setDeletingAllStudents(true);
    try {
      await onDeleteAllStudents();
      resetDeleteAllModal();
    } finally {
      setDeletingAllStudents(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 sm:pb-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Students & Marks</h1>
          <p className="text-sm mt-1 text-muted-foreground">
            Managing {students.length} student(s)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedStudentIds.size > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={bulkActionPending}>
                  Bulk Actions ({selectedStudentIds.size})
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {onBulkToggleWithdraw && (
                  <>
                    <DropdownMenuItem onClick={() => handleBulkWithdraw(true)}>
                      <UserX className="w-4 h-4 mr-2" />
                      Mark as Withdrawn
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkWithdraw(false)}>
                      <UserCheck className="w-4 h-4 mr-2" />
                      Un-mark Withdrawn
                    </DropdownMenuItem>
                  </>
                )}
                {onBulkToggleAlias && course?.aliasEnabled && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleBulkAlias(true)}>
                      <Tag className="w-4 h-4 mr-2" />
                      Add to New Code
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkAlias(false)}>
                      <Tag className="w-4 h-4 mr-2" />
                      Remove from New Code
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            onClick={onShowAddStudentModal}
            variant="outline"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Student
          </Button>
          <Button
            onClick={onShowBulkAddStudentModal}
            variant="outline"
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            Bulk Import (CSV)
          </Button>
          {course?.aliasEnabled && (
            <Button
              onClick={onAutoCategorizeAlias}
              variant="outline"
              className="gap-2"
            >
              <Tag className="w-4 h-4" />
              Auto-categorize to New Code
            </Button>
          )}
          <Button
            onClick={() => setShowDeleteAllModal(true)}
            variant="destructive"
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete All Students
          </Button>
        </div>
      </div>
      <div className="hidden sm:block sticky top-0 z-30 -mx-6 px-6 py-3 bg-background/95 backdrop-blur-md border-b border-border/60">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            onChange={(e) => setSearch(e.target.value)}
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
                <th rowSpan={2} className="px-3 py-3 text-center sticky left-0 z-30 bg-muted border-r w-[40px] align-middle">
                  <Checkbox
                    checked={filteredStudents.length > 0 && selectedStudentIds.size === filteredStudents.length}
                    onCheckedChange={toggleAllSelection}
                    aria-label="Select all"
                  />
                </th>
                <th rowSpan={2} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider sticky left-[40px] z-30 bg-muted border-r w-[50px] align-middle">#</th>
                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider sticky left-[90px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.1)] bg-muted border-r min-w-[200px] align-middle">Student</th>
                {examGroups.map((group, gIdx) => (
                  <th
                    key={group.key}
                    colSpan={group.exams.length}
                    className={`px-4 py-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/60 border-b ${gIdx > 0 ? 'border-l-2 border-border' : ''}`}
                  >
                    {group.label}
                  </th>
                ))}
                {hasQuizzes && (
                  <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-amber-500/10 border-l-2 border-amber-500/50 min-w-[150px] whitespace-nowrap align-middle">
                    <div className="flex items-center gap-1">
                      <span>📝 Quiz (Agg)</span>
                    </div>
                    <div className="text-[10px] font-normal mt-0.5 text-amber-600 dark:text-amber-400">
                      {course?.quizAggregation === 'best' ? 'Best' : 'Avg'} → Score / {course?.quizWeightage || 0}%
                    </div>
                  </th>
                )}
                {hasAssignments && (
                  <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-blue-500/10 border-l-2 border-blue-500/50 min-w-[170px] whitespace-nowrap align-middle">
                    <div className="flex items-center gap-1">
                      <span>📋 {course?.courseType === 'Lab' ? 'CLA' : 'Assignment'} (Agg)</span>
                    </div>
                    <div className="text-[10px] font-normal mt-0.5 text-blue-600 dark:text-blue-400">
                      {course?.assignmentAggregation === 'best' ? 'Best' : course?.assignmentAggregation === 'sum' ? 'Sum' : 'Avg'} → Score / {course?.assignmentWeightage || 0}%
                    </div>
                  </th>
                )}
                {hasProjects && (
                  <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-violet-500/10 border-l-2 border-violet-500/50 min-w-[190px] whitespace-nowrap align-middle">
                    <div className="flex items-center gap-1">
                      <span>{course?.courseType === 'Lab' ? '🚀 OEL / CE Project' : '🎓 Project'} (Agg)</span>
                    </div>
                    <div className="text-[10px] font-normal mt-0.5 text-violet-600 dark:text-violet-400">
                      Sum of sections → Score / {course?.projectWeightage || 0}%
                    </div>
                  </th>
                )}
                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-l-2 border-green-500/50 min-w-[160px] whitespace-nowrap align-middle">
                  <div className="flex items-center gap-1">
                    <span>🎯 Final Grade (Est.)</span>
                  </div>
                  <div className="text-[10px] font-normal mt-0.5 text-green-600 dark:text-green-400">
                    Weighted Total
                  </div>
                </th>
                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-purple-500/10 to-violet-500/10 border-l-2 border-purple-500/50 min-w-[140px] whitespace-nowrap align-middle">
                  <div className="flex items-center gap-1">
                    <span>🏆 Letter Grade</span>
                  </div>
                  <div className="text-[10px] font-normal mt-0.5 text-purple-600 dark:text-purple-400">
                    Based on %
                  </div>
                </th>
                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[80px] whitespace-nowrap align-middle sticky right-0 z-30 border-l bg-muted">Actions</th>
              </tr>
              <tr>
                {examGroups.map((group, gIdx) =>
                  group.exams.map((exam, eIdx) => (
                    <th
                      key={exam._id}
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[130px] whitespace-nowrap ${gIdx > 0 && eIdx === 0 ? 'border-l-2 border-border' : ''}`}
                    >
                      <div>{exam.displayName}</div>
                      {exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment' || exam.examCategory === 'Project' ? (
                        <div className="text-[10px] font-normal mt-0.5 text-muted-foreground">Raw Mark</div>
                      ) : (
                        <div className="text-[10px] font-normal mt-0.5 text-muted-foreground">Raw / Weighted</div>
                      )}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={exams.length + 8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No students match &quot;{search}&quot;
                  </td>
                </tr>
              )}
              {filteredStudents.map((student, idx) => (
                <tr key={student._id} className={`transition-colors hover:bg-muted/50 bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5 hover:bg-primary/10' : ''}`}>
                  <td className={`px-3 py-3 text-center sticky left-0 z-10 border-r w-[40px] bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5' : ''}`}>
                    <Checkbox 
                      checked={selectedStudentIds.has(student._id)}
                      onCheckedChange={() => toggleStudentSelection(student._id)}
                      aria-label={`Select ${student.name}`}
                    />
                  </td>
                  <td className={`px-3 py-3 text-sm font-medium text-center sticky left-[40px] z-10 border-r w-[50px] bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5' : ''}`}>{idx + 1}</td>
                  <td className={`px-4 py-3 text-sm font-medium sticky left-[90px] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.1)] border-r min-w-[200px] bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5' : ''}`}>
                    <div className="flex flex-col">
                      <span className="text-primary font-semibold">{student.studentId}</span>
                      <button
                        onClick={() => onShowStudentDetail(student)}
                        className={`text-xs hover:underline transition-colors cursor-pointer text-left ${student.withdrawn ? 'text-amber-700 dark:text-yellow-400 font-semibold' : 'text-muted-foreground hover:text-blue-400'}`}
                      >
                        {student.name} {student.withdrawn && <span className="font-bold ml-1">(W)</span>}
                      </button>
                      {course?.aliasEnabled && student.useAlias && (
                        <Badge variant="secondary" className="mt-1 w-fit gap-1 text-[10px]">
                          <Tag className="h-2.5 w-2.5" />
                          New Code: {course.alternateCode}
                        </Badge>
                      )}
                    </div>
                  </td>
                  {orderedExams.map((exam, idx) => {
                    const mark = getMark(student._id, exam._id);
                    const isAggregatedCategory = exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment' || exam.examCategory === 'Project';
                    const isGroupStart = idx > 0 && (orderedExams[idx - 1].examCategory || 'Others') !== (exam.examCategory || 'Others');
                    return (
                      <td key={exam._id} className={`px-4 py-3 text-sm ${isGroupStart ? 'border-l-2 border-border' : ''}`}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            {mark ? (
                              isAggregatedCategory ? (
                                // For aggregated categories, show only raw mark
                                <Badge variant="secondary" className="font-medium justify-start">
                                  {mark.rawMark} / {exam.totalMarks}
                                </Badge>
                              ) : (
                                // For regular exams, show both raw and weighted
                                <div className="flex flex-col gap-1">
                                  <Badge variant="secondary" className="font-medium justify-start">
                                    Raw: {mark.rawMark}
                                  </Badge>
                                  <Badge variant="secondary" className="font-medium bg-emerald-500/20 justify-start">
                                    Weighted:{' '}
                                    {(mark.weightedMark !== undefined && mark.weightedMark !== null
                                      ? mark.weightedMark
                                      : (mark.rawMark / exam.totalMarks) * exam.weightage
                                    ).toFixed(2)}
                                  </Badge>
                                </div>
                              )
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                  {hasQuizzes && (
                    <td className="px-4 py-3 text-sm bg-amber-500/5 border-l-2 border-amber-500/30">
                      {(() => {
                        const aggMark = getAggregatedMark(student._id, 'Quiz');
                        if (!aggMark) return <span className="text-muted-foreground">—</span>;
                        return (
                          <span className="px-2 py-1 rounded font-medium text-xs bg-amber-500/15 text-amber-700 dark:text-amber-200">
                            {aggMark.rawMark.toFixed(2)} / {course?.quizWeightage || 0}
                          </span>
                        );
                      })()}
                    </td>
                  )}
                  {hasAssignments && (
                    <td className="px-4 py-3 text-sm bg-blue-500/5 border-l-2 border-blue-500/30">
                      {(() => {
                        const aggMark = getAggregatedMark(student._id, 'Assignment');
                        if (!aggMark) return <span className="text-muted-foreground">—</span>;
                        return (
                          <span className="px-2 py-1 rounded font-medium text-xs bg-blue-500/15 text-blue-700 dark:text-blue-200">
                            {aggMark.rawMark.toFixed(2)} / {course?.assignmentWeightage || 0}
                          </span>
                        );
                      })()}
                    </td>
                  )}
                  {hasProjects && (
                    <td className="px-4 py-3 text-sm bg-violet-500/5 border-l-2 border-violet-500/30">
                      {(() => {
                        const aggMark = getProjectAggregatedMark(student._id);
                        if (!aggMark) return <span className="text-muted-foreground">—</span>;
                        return (
                          <div className="flex flex-col gap-1">
                            <span className="px-2 py-1 rounded font-medium text-xs bg-violet-500/15 text-violet-700 dark:text-violet-200">
                              {aggMark.sumRaw} / {aggMark.sumTotal} pts
                            </span>
                            <span className="px-2 py-1 rounded font-medium text-xs bg-violet-500/10 text-violet-700 dark:text-violet-300">
                              → {aggMark.rawMark.toFixed(2)} / {course?.projectWeightage || 0}%
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm bg-gradient-to-r from-green-500/5 to-emerald-500/5 border-l-2 border-green-500/30">
                    {(() => {
                      if (student.withdrawn) {
                        return <span className="text-muted-foreground font-semibold italic">Withdrawn</span>;
                      }

                      const gradeData = calculateFinalGrade(student._id);
                      if (gradeData.breakdown.length === 0) {
                        return <span className="text-muted-foreground">0</span>;
                      }

                      return (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-1 rounded font-medium text-xs bg-green-500/15 text-green-700 dark:text-green-200">
                                Total: {gradeData.total.toFixed(2)}%
                              </span>
                              <span className="text-[10px] italic text-muted-foreground">
                                Out of 100%
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => onShowGradeBreakdown(student)}
                            className="px-2 py-1 bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 text-xs rounded transition-all"
                            title="View breakdown"
                          >
                            ℹ️
                          </button>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm bg-gradient-to-r from-purple-500/5 to-violet-500/5 border-l-2 border-purple-500/30">
                    {(() => {
                      if (student.withdrawn) {
                        return (
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1.5 rounded-lg font-bold text-sm bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30">
                              W
                            </span>
                            <span className="text-xs text-muted-foreground">
                              (Withdrawn)
                            </span>
                          </div>
                        );
                      }

                      const gradeData = calculateFinalGrade(student._id);
                      if (gradeData.breakdown.length === 0) {
                        return <span className="text-muted-foreground">0</span>;
                      }

                      const letterGrade = calculateLetterGrade(gradeData.total, course?.gradingScale);

                      if (!letterGrade) {
                        return <span className="text-muted-foreground">0</span>;
                      }

                      return (
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1.5 rounded-lg font-bold text-sm ${getGradeBgColor(letterGrade.letter)} ${getGradeColor(letterGrade.letter)} border ${letterGrade.letter === 'A' ? 'border-green-500/30' : letterGrade.letter === 'B' ? 'border-blue-500/30' : letterGrade.letter === 'C' ? 'border-yellow-500/30' : letterGrade.letter === 'D' ? 'border-orange-500/30' : 'border-red-500/30'}`}>
                            {getGradeDisplay(letterGrade.letter, letterGrade.modifier)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({gradeData.total.toFixed(2)}%)
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className={`px-4 py-3 text-sm sticky right-0 z-10 border-l bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5' : ''}`}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => onToggleWithdrawStudent(student)}>
                          {student.withdrawn ? <UserCheck className="w-4 h-4 mr-2" /> : <UserX className="w-4 h-4 mr-2" />}
                          {student.withdrawn ? 'Un-withdraw Student' : 'Mark as Withdrawn'}
                        </DropdownMenuItem>
                        {course?.aliasEnabled && (
                          <DropdownMenuItem onClick={() => onToggleAlias(student)}>
                            <Tag className="w-4 h-4 mr-2" />
                            {student.useAlias ? `Remove from New Code (${course.alternateCode})` : `Add to New Code (${course.alternateCode})`}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onEditStudent(student)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit Student
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDeleteStudent(student)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Student
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Floating Action Buttons */}
      {showFloatingButtons && (
        <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
          {selectedStudentIds.size > 0 && (
            <Button
              onClick={() => setShowBulkDeleteModal(true)}
              variant="destructive"
              className="gap-2 shadow-lg hover:shadow-xl transition-shadow"
              size="lg"
            >
              <Trash2 className="w-5 h-5" />
              Delete Selected ({selectedStudentIds.size})
            </Button>
          )}
          <Button
            onClick={onShowAddStudentModal}
            className="gap-2 shadow-lg hover:shadow-xl transition-shadow"
            size="lg"
          >
            <Plus className="w-5 h-5" />
            Add Student
          </Button>
          <Button
            onClick={onShowBulkAddStudentModal}
            variant="secondary"
            className="gap-2 shadow-lg hover:shadow-xl transition-shadow"
            size="lg"
          >
            <Upload className="w-5 h-5" />
            Bulk Import
          </Button>
          <Button
            onClick={() => setShowDeleteAllModal(true)}
            variant="destructive"
            className="gap-2 shadow-lg hover:shadow-xl transition-shadow"
            size="lg"
          >
            <Trash2 className="w-5 h-5" />
            Delete All
          </Button>
        </div>
      )}

      <Dialog open={showDeleteAllModal} onOpenChange={(open) => {
        if (!open) resetDeleteAllModal();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete All Students
            </DialogTitle>
            <DialogDescription>
              {deleteAllConfirmationStep === 0
                ? 'Are you sure you want to delete every student in this course?'
                : 'FINAL CONFIRMATION: This will permanently remove all students and their marks.'}
            </DialogDescription>
          </DialogHeader>

          {deleteAllConfirmationStep === 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">You are about to delete {students.length} student{students.length !== 1 ? 's' : ''}.</p>
                  <p>This will also delete all marks associated with those students.</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {deleteAllConfirmationStep === 1 && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="space-y-3">
                  <p className="font-bold text-lg">⚠️ FINAL CONFIRMATION</p>
                  <p>Type <strong>DELETE</strong> below to remove all students from this course.</p>
                  <Input
                    value={deleteAllConfirmationText}
                    onChange={(e) => setDeleteAllConfirmationText(e.target.value)}
                    placeholder="Type DELETE"
                    className="mt-2 border-red-500"
                  />
                </div>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="flex gap-2">
            {deleteAllConfirmationStep > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteAllConfirmationStep(0);
                  setDeleteAllConfirmationText('');
                }}
              >
                Back
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={resetDeleteAllModal}
              disabled={deletingAllStudents}
            >
              Cancel
            </Button>
            {deleteAllConfirmationStep === 0 ? (
              <Button
                variant="destructive"
                onClick={() => setDeleteAllConfirmationStep(1)}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleDeleteAllStudents}
                disabled={deletingAllStudents || deleteAllConfirmationText !== 'DELETE'}
              >
                {deletingAllStudents ? 'Deleting...' : 'Delete All Students'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkDeleteModal} onOpenChange={(open) => {
        if (!open) resetBulkDeleteModal();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Selected Students
            </DialogTitle>
            <DialogDescription>
              {bulkDeleteConfirmationStep === 0
                ? `Are you sure you want to delete ${selectedStudentIds.size} selected student(s)?`
                : 'FINAL CONFIRMATION: This will permanently remove the selected students and their marks.'}
            </DialogDescription>
          </DialogHeader>

          {bulkDeleteConfirmationStep === 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">You are about to delete {selectedStudentIds.size} student(s).</p>
                  <p>This will also delete all marks associated with these students.</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="flex gap-2">
            {bulkDeleteConfirmationStep > 0 && (
              <Button
                variant="outline"
                onClick={() => setBulkDeleteConfirmationStep(0)}
              >
                Back
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={resetBulkDeleteModal}
              disabled={deletingBulkStudents}
            >
              Cancel
            </Button>
            {bulkDeleteConfirmationStep === 0 ? (
              <Button
                variant="destructive"
                onClick={() => setBulkDeleteConfirmationStep(1)}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleBulkDeleteStudents}
                disabled={deletingBulkStudents}
              >
                {deletingBulkStudents ? 'Deleting...' : 'Delete Selected'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
