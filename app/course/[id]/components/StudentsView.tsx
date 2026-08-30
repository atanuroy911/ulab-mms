'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Plus, Upload, Trash2, Tag, Search, MoreVertical, ChevronDown, UserX, UserCheck, Pencil, Gauge, Sparkles } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import AggregateMarksModal from './AggregateMarksModal';

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
  examType?: string;
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
  onShowStatisticsModal?: () => void;
  onShowGraceHistory?: (studentId: string) => void;
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
  onShowStatisticsModal,
  onShowGraceHistory,
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

  const [aggregateModal, setAggregateModal] = useState<{
    student: Student;
    categoryLabel: string;
    categoryExams: Exam[];
    aggregationMethod: 'average' | 'best' | 'sum' | 'direct';
    weightage: number;
    aggregatedValue: number | null;
  } | null>(null);

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

  // Exams that contribute directly (no Quiz/Assignment/Project-style aggregation) - grouped so the
  // compact table can still surface Midterm/Final/Attendance/Class Performance at a glance without
  // going back to one column per exam.
  const midtermExams = exams.filter(e => e.examType === 'midterm');
  const finalExams = exams.filter(e => e.examType === 'final' || e.examType === 'labFinal');
  const attendanceExams = exams.filter(e => e.examCategory === 'Attendance');
  const classPerformanceExams = exams.filter(e => e.examCategory === 'ClassPerformance');
  const otherExams = exams.filter(e => {
    if (['Quiz', 'Assignment', 'Project', 'Attendance', 'ClassPerformance'].includes(e.examCategory || '')) return false;
    if (e.examType === 'midterm' || e.examType === 'final' || e.examType === 'labFinal') return false;
    return true;
  });

  const getCategoryContribution = (studentId: string, categoryExams: Exam[]) => {
    let sum = 0;
    let weightSum = 0;
    let enteredCount = 0;
    for (const exam of categoryExams) {
      weightSum += exam.weightage;
      const mark = getMark(studentId, exam._id);
      if (mark) {
        enteredCount++;
        sum += mark.weightedMark ?? (exam.totalMarks > 0 ? (mark.rawMark / exam.totalMarks) * exam.weightage : 0);
      }
    }
    return { sum, weightSum, enteredCount };
  };

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
          {onShowStatisticsModal && (
            <Button
              onClick={onShowStatisticsModal}
              variant="outline"
              className="gap-2"
            >
              <Gauge className="w-4 h-4" />
              Statistics
            </Button>
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
                <th className="px-3 py-2.5 text-center sticky left-0 z-30 bg-muted border-r w-[40px] align-middle">
                  <Checkbox
                    checked={filteredStudents.length > 0 && selectedStudentIds.size === filteredStudents.length}
                    onCheckedChange={toggleAllSelection}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider sticky left-[40px] z-30 bg-muted border-r w-[50px] align-middle">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider sticky left-[90px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.1)] bg-muted border-r min-w-[220px] align-middle">Student</th>
                {midtermExams.length > 0 && (
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[80px] whitespace-nowrap align-middle">Midterm</th>
                )}
                {finalExams.length > 0 && (
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[80px] whitespace-nowrap align-middle">Final</th>
                )}
                {hasQuizzes && (
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[90px] whitespace-nowrap align-middle" title={`Quiz - ${course?.quizAggregation === 'best' ? 'best' : 'average'}, out of ${course?.quizWeightage || 0}%`}>
                    Quiz
                  </th>
                )}
                {hasAssignments && (
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[90px] whitespace-nowrap align-middle" title={`${course?.courseType === 'Lab' ? 'CLA' : 'Assignment'} - ${course?.assignmentAggregation === 'best' ? 'best' : course?.assignmentAggregation === 'sum' ? 'sum' : 'average'}, out of ${course?.assignmentWeightage || 0}%`}>
                    {course?.courseType === 'Lab' ? 'CLA' : 'Assignment'}
                  </th>
                )}
                {hasProjects && (
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[100px] whitespace-nowrap align-middle" title={`${course?.courseType === 'Lab' ? 'OEL / CE Project' : 'Project'}, out of ${course?.projectWeightage || 0}%`}>
                    {course?.courseType === 'Lab' ? 'OEL/CE' : 'Project'}
                  </th>
                )}
                {classPerformanceExams.length > 0 && (
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[90px] whitespace-nowrap align-middle">Performance</th>
                )}
                {attendanceExams.length > 0 && (
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[90px] whitespace-nowrap align-middle">Attendance</th>
                )}
                {otherExams.length > 0 && (
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[80px] whitespace-nowrap align-middle">Others</th>
                )}
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[140px] whitespace-nowrap align-middle border-l-2 border-border">Grade</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider min-w-[80px] whitespace-nowrap align-middle sticky right-0 z-30 border-l bg-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredStudents.length === 0 && (
                <tr>
                  <td
                    colSpan={
                      7 +
                      (midtermExams.length > 0 ? 1 : 0) +
                      (finalExams.length > 0 ? 1 : 0) +
                      (classPerformanceExams.length > 0 ? 1 : 0) +
                      (attendanceExams.length > 0 ? 1 : 0) +
                      (otherExams.length > 0 ? 1 : 0)
                    }
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No students match &quot;{search}&quot;
                  </td>
                </tr>
              )}
              {filteredStudents.map((student, idx) => {
                const gradeData = student.withdrawn ? null : calculateFinalGrade(student._id);
                const letterGrade = gradeData && gradeData.breakdown.length > 0 ? calculateLetterGrade(gradeData.total, course?.gradingScale) : null;
                const studentHasGrace = marks.some(m => m.studentId === student._id && typeof (m as { preGraceMark?: number | null }).preGraceMark === 'number');

                return (
                <tr key={student._id} className={`transition-colors hover:bg-muted/50 bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5 hover:bg-primary/10' : ''}`}>
                  <td className={`px-3 py-2 text-center sticky left-0 z-10 border-r w-[40px] bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5' : ''}`}>
                    <Checkbox
                      checked={selectedStudentIds.has(student._id)}
                      onCheckedChange={() => toggleStudentSelection(student._id)}
                      aria-label={`Select ${student.name}`}
                    />
                  </td>
                  <td className={`px-3 py-2 text-sm font-medium text-center sticky left-[40px] z-10 border-r w-[50px] bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5' : ''}`}>{idx + 1}</td>
                  <td className={`px-4 py-2 text-sm sticky left-[90px] z-10 shadow-[2px_0_5px_rgba(0,0,0,0.1)] border-r min-w-[220px] bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5' : ''}`}>
                    <button
                      onClick={() => onShowStudentDetail(student)}
                      className="flex items-center gap-1.5 text-left hover:opacity-70 transition-opacity"
                    >
                      <span className="text-primary font-semibold">{student.studentId}</span>
                      <span className={student.withdrawn ? 'text-amber-700 dark:text-yellow-400 font-semibold' : 'text-muted-foreground'}>
                        {student.name}
                      </span>
                      {student.withdrawn && <span className="font-bold text-amber-700 dark:text-yellow-400">(W)</span>}
                      {course?.aliasEnabled && student.useAlias && (
                        <Badge variant="secondary" className="gap-1 text-[10px] shrink-0">
                          <Tag className="h-2.5 w-2.5" />
                          {course.alternateCode}
                        </Badge>
                      )}
                    </button>
                  </td>
                  {midtermExams.length > 0 && (
                    <td className="px-3 py-2 text-sm">
                      {(() => {
                        const { sum, weightSum, enteredCount } = getCategoryContribution(student._id, midtermExams);
                        if (enteredCount === 0) return <span className="text-muted-foreground">—</span>;
                        return (
                          <button
                            onClick={() => setAggregateModal({ student, categoryLabel: 'Midterm', categoryExams: midtermExams, aggregationMethod: 'direct', weightage: weightSum, aggregatedValue: sum })}
                            className="font-medium hover:underline"
                          >
                            {sum.toFixed(1)}<span className="text-muted-foreground">/{weightSum}</span>
                          </button>
                        );
                      })()}
                    </td>
                  )}
                  {finalExams.length > 0 && (
                    <td className="px-3 py-2 text-sm">
                      {(() => {
                        const { sum, weightSum, enteredCount } = getCategoryContribution(student._id, finalExams);
                        if (enteredCount === 0) return <span className="text-muted-foreground">—</span>;
                        return (
                          <button
                            onClick={() => setAggregateModal({ student, categoryLabel: 'Final', categoryExams: finalExams, aggregationMethod: 'direct', weightage: weightSum, aggregatedValue: sum })}
                            className="font-medium hover:underline"
                          >
                            {sum.toFixed(1)}<span className="text-muted-foreground">/{weightSum}</span>
                          </button>
                        );
                      })()}
                    </td>
                  )}
                  {hasQuizzes && (
                    <td className="px-3 py-2 text-sm">
                      {(() => {
                        const aggMark = getAggregatedMark(student._id, 'Quiz');
                        if (!aggMark) return <span className="text-muted-foreground">—</span>;
                        const quizExams = exams.filter(e => e.examCategory === 'Quiz');
                        return (
                          <button
                            onClick={() => setAggregateModal({ student, categoryLabel: 'Quiz', categoryExams: quizExams, aggregationMethod: course?.quizAggregation === 'best' ? 'best' : 'average', weightage: course?.quizWeightage || 0, aggregatedValue: aggMark.rawMark })}
                            className="font-medium hover:underline"
                          >
                            {aggMark.rawMark.toFixed(1)}<span className="text-muted-foreground">/{course?.quizWeightage || 0}</span>
                          </button>
                        );
                      })()}
                    </td>
                  )}
                  {hasAssignments && (
                    <td className="px-3 py-2 text-sm">
                      {(() => {
                        const aggMark = getAggregatedMark(student._id, 'Assignment');
                        if (!aggMark) return <span className="text-muted-foreground">—</span>;
                        const assignmentExams = exams.filter(e => e.examCategory === 'Assignment');
                        return (
                          <button
                            onClick={() => setAggregateModal({ student, categoryLabel: course?.courseType === 'Lab' ? 'CLA' : 'Assignment', categoryExams: assignmentExams, aggregationMethod: course?.assignmentAggregation || 'average', weightage: course?.assignmentWeightage || 0, aggregatedValue: aggMark.rawMark })}
                            className="font-medium hover:underline"
                          >
                            {aggMark.rawMark.toFixed(1)}<span className="text-muted-foreground">/{course?.assignmentWeightage || 0}</span>
                          </button>
                        );
                      })()}
                    </td>
                  )}
                  {hasProjects && (
                    <td className="px-3 py-2 text-sm">
                      {(() => {
                        const aggMark = getProjectAggregatedMark(student._id);
                        if (!aggMark) return <span className="text-muted-foreground">—</span>;
                        const projectExams = exams.filter(e => e.examCategory === 'Project');
                        return (
                          <button
                            onClick={() => setAggregateModal({ student, categoryLabel: course?.courseType === 'Lab' ? 'OEL / CE Project' : 'Project', categoryExams: projectExams, aggregationMethod: 'sum', weightage: course?.projectWeightage || 0, aggregatedValue: aggMark.rawMark })}
                            className="font-medium hover:underline"
                          >
                            {aggMark.rawMark.toFixed(1)}<span className="text-muted-foreground">/{course?.projectWeightage || 0}</span>
                          </button>
                        );
                      })()}
                    </td>
                  )}
                  {classPerformanceExams.length > 0 && (
                    <td className="px-3 py-2 text-sm">
                      {(() => {
                        const { sum, weightSum, enteredCount } = getCategoryContribution(student._id, classPerformanceExams);
                        if (enteredCount === 0) return <span className="text-muted-foreground">—</span>;
                        return (
                          <button
                            onClick={() => setAggregateModal({ student, categoryLabel: 'Performance', categoryExams: classPerformanceExams, aggregationMethod: 'direct', weightage: weightSum, aggregatedValue: sum })}
                            className="font-medium hover:underline"
                          >
                            {sum.toFixed(1)}<span className="text-muted-foreground">/{weightSum}</span>
                          </button>
                        );
                      })()}
                    </td>
                  )}
                  {attendanceExams.length > 0 && (
                    <td className="px-3 py-2 text-sm">
                      {(() => {
                        const { sum, weightSum, enteredCount } = getCategoryContribution(student._id, attendanceExams);
                        if (enteredCount === 0) return <span className="text-muted-foreground">—</span>;
                        return (
                          <button
                            onClick={() => setAggregateModal({ student, categoryLabel: 'Attendance', categoryExams: attendanceExams, aggregationMethod: 'direct', weightage: weightSum, aggregatedValue: sum })}
                            className="font-medium hover:underline"
                          >
                            {sum.toFixed(1)}<span className="text-muted-foreground">/{weightSum}</span>
                          </button>
                        );
                      })()}
                    </td>
                  )}
                  {otherExams.length > 0 && (
                    <td className="px-3 py-2 text-sm">
                      {(() => {
                        const { sum, weightSum, enteredCount } = getCategoryContribution(student._id, otherExams);
                        if (enteredCount === 0) return <span className="text-muted-foreground">—</span>;
                        return (
                          <button
                            onClick={() => setAggregateModal({ student, categoryLabel: 'Others', categoryExams: otherExams, aggregationMethod: 'direct', weightage: weightSum, aggregatedValue: sum })}
                            className="font-medium hover:underline"
                          >
                            {sum.toFixed(1)}<span className="text-muted-foreground">/{weightSum}</span>
                          </button>
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-4 py-2 text-sm border-l-2 border-border">
                    {student.withdrawn ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded font-bold text-xs bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30">W</span>
                        <span className="text-xs text-muted-foreground">Withdrawn</span>
                      </span>
                    ) : !letterGrade ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded font-bold text-xs ${getGradeBgColor(letterGrade.letter)} ${getGradeColor(letterGrade.letter)} border ${letterGrade.letter === 'A' ? 'border-green-500/30' : letterGrade.letter === 'B' ? 'border-blue-500/30' : letterGrade.letter === 'C' ? 'border-yellow-500/30' : letterGrade.letter === 'D' ? 'border-orange-500/30' : 'border-red-500/30'}`}>
                          {getGradeDisplay(letterGrade.letter, letterGrade.modifier)}
                        </span>
                        <span className="text-xs text-muted-foreground">{gradeData!.total.toFixed(1)}%</span>
                        <button
                          onClick={() => onShowGradeBreakdown(student)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="View breakdown"
                        >
                          <Gauge className="w-3.5 h-3.5" />
                        </button>
                        {studentHasGrace && onShowGraceHistory && (
                          <button
                            type="button"
                            onClick={() => onShowGraceHistory(student._id)}
                            title="Grace applied - click to see before/after breakdown"
                            className="text-violet-500 hover:text-violet-600 transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={`px-4 py-2 text-sm sticky right-0 z-10 border-l bg-background ${selectedStudentIds.has(student._id) ? 'bg-primary/5' : ''}`}>
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
                );
              })}
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

      <AggregateMarksModal
        isOpen={!!aggregateModal}
        onClose={() => setAggregateModal(null)}
        student={aggregateModal?.student ?? null}
        categoryLabel={aggregateModal?.categoryLabel ?? ''}
        exams={aggregateModal?.categoryExams ?? []}
        marks={marks}
        aggregationMethod={aggregateModal?.aggregationMethod ?? 'direct'}
        weightage={aggregateModal?.weightage ?? 0}
        aggregatedValue={aggregateModal?.aggregatedValue ?? null}
      />
    </div>
  );
}
