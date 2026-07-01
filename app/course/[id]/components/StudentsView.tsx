'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Plus, Upload, Trash2, Tag } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

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
  assignmentAggregation?: 'average' | 'best';
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
  onAutoCategorizeAlias,
}: StudentsViewProps) {
  const [showFloatingButtons, setShowFloatingButtons] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllConfirmationStep, setDeleteAllConfirmationStep] = useState(0);
  const [deleteAllConfirmationText, setDeleteAllConfirmationText] = useState('');
  const [deletingAllStudents, setDeletingAllStudents] = useState(false);

  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteConfirmationStep, setBulkDeleteConfirmationStep] = useState(0);
  const [deletingBulkStudents, setDeletingBulkStudents] = useState(false);

  const toggleStudentSelection = (studentId: string) => {
    const newSelected = new Set(selectedStudentIds);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudentIds(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedStudentIds.size === students.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(students.map(s => s._id)));
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Students & Marks</h1>
          <p className="text-sm mt-1 text-muted-foreground">
            Managing {students.length} student(s)
          </p>
        </div>
        <div className="flex gap-2">
          {selectedStudentIds.size > 0 && (
            <Button
              onClick={() => setShowBulkDeleteModal(true)}
              variant="destructive"
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedStudentIds.size})
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
      <Card className="p-6">
        <div className="overflow-x-auto max-h-[calc(100vh-200px)] sticky top-0">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted sticky top-0 z-20">
              <tr>
                <th className="px-3 py-3 text-center sticky left-0 z-30 bg-muted border-r w-[40px]">
                  <Checkbox 
                    checked={students.length > 0 && selectedStudentIds.size === students.length}
                    onCheckedChange={toggleAllSelection}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider sticky left-[40px] z-30 bg-muted border-r w-[50px]">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider sticky left-[90px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.1)] bg-muted border-r min-w-[200px]">Student</th>
                {exams.map(exam => (
                  <th key={exam._id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[130px] whitespace-nowrap">
                    <div>{exam.displayName}</div>
                    {exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment' || exam.examCategory === 'Project' ? (
                      <div className="text-[10px] font-normal mt-0.5 text-muted-foreground">Raw Mark</div>
                    ) : (
                      <div className="text-[10px] font-normal mt-0.5 text-muted-foreground">Raw / Weighted</div>
                    )}
                  </th>
                ))}
                {hasQuizzes && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-amber-900/20 border-l-2 border-amber-500/50 min-w-[150px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span>📝 Quiz (Agg)</span>
                    </div>
                    <div className="text-[10px] font-normal mt-0.5 text-amber-400">
                      {course?.quizAggregation === 'best' ? 'Best' : 'Avg'} → Score / {course?.quizWeightage || 0}%
                    </div>
                  </th>
                )}
                {hasAssignments && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-blue-900/20 border-l-2 border-blue-500/50 min-w-[170px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span>📋 {course?.courseType === 'Lab' ? 'CLA' : 'Assignment'} (Agg)</span>
                    </div>
                    <div className="text-[10px] font-normal mt-0.5 text-blue-400">
                      {course?.assignmentAggregation === 'best' ? 'Best' : 'Avg'} → Score / {course?.assignmentWeightage || 0}%
                    </div>
                  </th>
                )}
                {hasProjects && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-violet-900/20 border-l-2 border-violet-500/50 min-w-[190px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span>{course?.courseType === 'Lab' ? '🚀 OEL / CE Project' : '🎓 Project'} (Agg)</span>
                    </div>
                    <div className="text-[10px] font-normal mt-0.5 text-violet-400">
                      Sum of sections → Score / {course?.projectWeightage || 0}%
                    </div>
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-l-2 border-green-500/50 min-w-[160px] whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <span>🎯 Final Grade (Est.)</span>
                  </div>
                  <div className="text-[10px] font-normal mt-0.5 text-green-400">
                    Weighted Total
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-purple-900/20 to-violet-900/20 border-l-2 border-purple-500/50 min-w-[140px] whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <span>🏆 Letter Grade</span>
                  </div>
                  <div className="text-[10px] font-normal mt-0.5 text-purple-400">
                    Based on %
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[120px] whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {students.map((student, idx) => (
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
                  {exams.map(exam => {
                    const mark = getMark(student._id, exam._id);
                    const isAggregatedCategory = exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment' || exam.examCategory === 'Project';
                    return (
                      <td key={exam._id} className="px-4 py-3 text-sm">
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
                    <td className="px-4 py-3 text-sm bg-amber-900/10 border-l-2 border-amber-500/30">
                      {(() => {
                        const aggMark = getAggregatedMark(student._id, 'Quiz');
                        if (!aggMark) return <span className="text-gray-600">—</span>;
                        return (
                          <span className="px-2 py-1 rounded font-medium text-xs bg-amber-900/40 text-amber-200">
                            {aggMark.rawMark.toFixed(2)} / {course?.quizWeightage || 0}
                          </span>
                        );
                      })()}
                    </td>
                  )}
                  {hasAssignments && (
                    <td className="px-4 py-3 text-sm bg-blue-900/10 border-l-2 border-blue-500/30">
                      {(() => {
                        const aggMark = getAggregatedMark(student._id, 'Assignment');
                        if (!aggMark) return <span className="text-gray-600">—</span>;
                        return (
                          <span className="px-2 py-1 rounded font-medium text-xs bg-blue-900/40 text-blue-200">
                            {aggMark.rawMark.toFixed(2)} / {course?.assignmentWeightage || 0}
                          </span>
                        );
                      })()}
                    </td>
                  )}
                  {hasProjects && (
                    <td className="px-4 py-3 text-sm bg-violet-900/10 border-l-2 border-violet-500/30">
                      {(() => {
                        const aggMark = getProjectAggregatedMark(student._id);
                        if (!aggMark) return <span className="text-gray-600">—</span>;
                        return (
                          <div className="flex flex-col gap-1">
                            <span className="px-2 py-1 rounded font-medium text-xs bg-violet-900/40 text-violet-200">
                              {aggMark.sumRaw} / {aggMark.sumTotal} pts
                            </span>
                            <span className="px-2 py-1 rounded font-medium text-xs bg-violet-700/30 text-violet-300">
                              → {aggMark.rawMark.toFixed(2)} / {course?.projectWeightage || 0}%
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm bg-gradient-to-r from-green-900/10 to-emerald-900/10 border-l-2 border-green-500/30">
                    {(() => {
                      if (student.withdrawn) {
                        return <span className="text-gray-600 font-semibold italic">Withdrawn</span>;
                      }

                      const gradeData = calculateFinalGrade(student._id);
                      if (gradeData.breakdown.length === 0) {
                        return <span className="text-gray-600">0</span>;
                      }
                      
                      return (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-1 rounded font-medium text-xs bg-green-900/40 text-green-200">
                                Total: {gradeData.total.toFixed(2)}%
                              </span>
                              <span className="text-[10px] italic text-gray-500">
                                Out of 100%
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => onShowGradeBreakdown(student)}
                            className="px-2 py-1 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 text-xs rounded transition-all"
                            title="View breakdown"
                          >
                            ℹ️
                          </button>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm bg-gradient-to-r from-purple-900/10 to-violet-900/10 border-l-2 border-purple-500/30">
                    {(() => {
                      if (student.withdrawn) {
                        return (
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1.5 rounded-lg font-bold text-sm bg-red-900/40 text-red-300 border border-red-500/30">
                              W
                            </span>
                            <span className="text-xs text-gray-500">
                              (Withdrawn)
                            </span>
                          </div>
                        );
                      }

                      const gradeData = calculateFinalGrade(student._id);
                      if (gradeData.breakdown.length === 0) {
                        return <span className="text-gray-600">0</span>;
                      }
                      
                      const letterGrade = calculateLetterGrade(gradeData.total, course?.gradingScale);
                      
                      if (!letterGrade) {
                        return <span className="text-gray-600">0</span>;
                      }
                      
                      return (
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1.5 rounded-lg font-bold text-sm ${getGradeBgColor(letterGrade.letter)} ${getGradeColor(letterGrade.letter)} border ${letterGrade.letter === 'A' ? 'border-green-500/30' : letterGrade.letter === 'B' ? 'border-blue-500/30' : letterGrade.letter === 'C' ? 'border-yellow-500/30' : letterGrade.letter === 'D' ? 'border-orange-500/30' : 'border-red-500/30'}`}>
                            {getGradeDisplay(letterGrade.letter, letterGrade.modifier)}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({gradeData.total.toFixed(2)}%)
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onToggleWithdrawStudent(student)}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-all font-bold ${
                          student.withdrawn
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border'
                        }`}
                        title={student.withdrawn ? "Un-withdraw Student" : "Mark as Withdrawn"}
                      >
                        W
                      </button>
                      {course?.aliasEnabled && (
                        <button
                          onClick={() => onToggleAlias(student)}
                          className={`px-3 py-1.5 text-xs rounded-lg transition-all font-bold ${
                            student.useAlias
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border'
                          }`}
                          title={student.useAlias ? `Remove from New Code (${course.alternateCode})` : `Add to New Code (${course.alternateCode})`}
                        >
                          <Tag className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => onEditStudent(student)}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-lg transition-all"
                        title="Edit Student"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => onDeleteStudent(student)}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-all"
                        title="Delete Student"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
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
