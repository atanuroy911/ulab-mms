'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, GraduationCap, AlertTriangle, ShieldAlert, X, Search } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface CourseSummary {
  _id: string;
  name: string;
  code: string;
}

interface CourseDetailExam {
  _id: string;
  displayName: string;
  examType: string;
  totalMarks: number;
  weightage: number;
}

interface CourseDetailStudent {
  _id: string;
  studentId: string;
  name: string;
  withdrawn: boolean;
  probation: boolean;
  examMarks: { examId: string; rawMark: number | null }[];
  quizAggregated: number | null;
  assignmentAggregated: number | null;
  projectAggregated: number | null;
  finalMarks: number | null;
  letterGrade: string;
  letter: string;
  modifier: string;
}

interface CourseDetails {
  course: {
    name: string;
    code: string;
    semester: string;
    year: number;
    section: string;
    courseType: string;
    showFinalGrade: boolean;
    quizWeightage: number;
    assignmentWeightage: number;
    projectWeightage: number;
  };
  exams: CourseDetailExam[];
  hasQuizzes: boolean;
  hasAssignments: boolean;
  hasProjects: boolean;
  students: CourseDetailStudent[];
}

interface CourseGradesModalProps {
  accountId: string | null;
  course: CourseSummary | null;
  onClose: () => void;
}

// Sticky-column offsets (px) — Student ID then Name are pinned while the rest of the
// (potentially very wide, one-column-per-exam) table scrolls horizontally underneath.
const STICKY_ID_WIDTH = 116;
const STICKY_NAME_WIDTH = 200;

const GRADE_BADGE_CLASSES: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  B: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  C: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  D: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30',
  F: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  W: 'bg-muted text-muted-foreground border-border',
};

function modifierSymbol(modifier: string): string {
  return modifier === '1' ? '-' : modifier === '2' ? '+' : '';
}

function GradeBadge({ letter, modifier }: { letter: string; modifier: string }) {
  const classes = GRADE_BADGE_CLASSES[letter] || GRADE_BADGE_CLASSES.W;
  const label = letter === 'W' ? 'W' : `${letter}${modifierSymbol(modifier)}`;
  return (
    <span className={cn('inline-flex min-w-9 items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums', classes)}>
      {label}
    </span>
  );
}

/**
 * Read-only course -> students -> marks -> grade drill-down for the admin dashboard.
 * Self-contained: fetches its own data from the admin course-details endpoint whenever
 * `course` is set, and renders nothing (besides a closed Dialog) otherwise.
 */
export default function CourseGradesModal({ accountId, course, onClose }: CourseGradesModalProps) {
  const [details, setDetails] = useState<CourseDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!accountId || !course) {
      setDetails(null);
      setError('');
      setSearch('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setSearch('');

    fetch(`/api/admin/accounts/${accountId}/courses/${course._id}/details`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setDetails(data);
        } else {
          setError(data.error || 'Failed to load course details');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error loading course details', err);
        setError('Failed to load course details');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, course]);

  const filteredStudents = useMemo(() => {
    if (!details) return [];
    const q = search.trim().toLowerCase();
    if (!q) return details.students;
    return details.students.filter(
      (s) => s.studentId.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [details, search]);

  return (
    <Dialog open={course !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 w-screen h-dvh max-w-none max-h-none top-0 left-0 translate-x-0 translate-y-0 rounded-none border-0 sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:h-[92vh] sm:max-w-350 sm:rounded-2xl sm:border overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4 space-y-0 text-left">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <GraduationCap className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">{course ? `${course.code} — ${course.name}` : 'Course Details'}</span>
            </DialogTitle>
            <DialogDescription className="mt-0.5">
              Read-only view of students, marks, and computed grades for this course.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center gap-2 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading course details...
          </div>
        ) : error ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : details ? (
          details.students.length === 0 ? (
            <p className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              This course has no students yet.
            </p>
          ) : (
            <>
              {/* Filter bar */}
              <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-b px-6 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{details.course.semester} {details.course.year}</Badge>
                  <Badge variant="secondary">Section {details.course.section}</Badge>
                  <Badge variant="secondary">{details.course.courseType}</Badge>
                  {!details.course.showFinalGrade && (
                    <Badge variant="outline" className="gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      Final grade hidden from students
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search student ID or name..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-nowrap">
                    <span className="font-medium text-foreground">{filteredStudents.length}</span> of {details.students.length} students
                  </p>
                </div>
              </div>

              {/* Table — outer div owns vertical scroll, Table's own wrapper owns horizontal
                  scroll, so sticky header (top) and sticky ID/Name/Grade columns (left/right)
                  each resolve against the right scrolling ancestor without double scrollbars. */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <CourseGradesTable details={details} students={filteredStudents} />
              </div>
            </>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CourseGradesTable({ details, students }: { details: CourseDetails; students: CourseDetailStudent[] }) {
  const { exams, hasQuizzes, hasAssignments, hasProjects } = details;

  if (students.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">No students match your search.</p>;
  }

  return (
    <Table className="border-separate border-spacing-0">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead
            className="sticky top-0 left-0 z-30 border-b bg-muted/60 backdrop-blur-sm"
            style={{ width: STICKY_ID_WIDTH, minWidth: STICKY_ID_WIDTH }}
          >
            Student ID
          </TableHead>
          <TableHead
            className="sticky top-0 z-30 border-b bg-muted/60 backdrop-blur-sm"
            style={{ left: STICKY_ID_WIDTH, width: STICKY_NAME_WIDTH, minWidth: STICKY_NAME_WIDTH }}
          >
            Name
          </TableHead>
          {exams.map((exam) => (
            <TableHead key={exam._id} className="sticky top-0 z-20 border-b bg-muted/60 backdrop-blur-sm text-right whitespace-nowrap">
              {exam.displayName}
            </TableHead>
          ))}
          {hasQuizzes && (
            <TableHead className="sticky top-0 z-20 border-b bg-muted/60 backdrop-blur-sm text-right whitespace-nowrap">
              Quiz (Agg)
            </TableHead>
          )}
          {hasAssignments && (
            <TableHead className="sticky top-0 z-20 border-b bg-muted/60 backdrop-blur-sm text-right whitespace-nowrap">
              Assignment (Agg)
            </TableHead>
          )}
          {hasProjects && (
            <TableHead className="sticky top-0 z-20 border-b bg-muted/60 backdrop-blur-sm text-right whitespace-nowrap">
              Project (Agg)
            </TableHead>
          )}
          <TableHead className="sticky top-0 z-20 border-b bg-muted/60 backdrop-blur-sm text-right whitespace-nowrap font-semibold">
            Final Marks
          </TableHead>
          <TableHead className="sticky top-0 right-0 z-30 border-b bg-muted/60 backdrop-blur-sm text-right whitespace-nowrap font-semibold">
            Grade
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student, index) => {
          const zebra = index % 2 === 1 ? 'bg-muted/25' : 'bg-background';
          return (
            <TableRow key={student._id} className={cn(zebra, 'hover:bg-accent/60')}>
              <TableCell
                className={cn('sticky left-0 z-10 border-b font-mono tabular-nums', zebra)}
                style={{ width: STICKY_ID_WIDTH, minWidth: STICKY_ID_WIDTH }}
              >
                {student.studentId}
              </TableCell>
              <TableCell
                className={cn('sticky z-10 border-b', zebra)}
                style={{ left: STICKY_ID_WIDTH, width: STICKY_NAME_WIDTH, minWidth: STICKY_NAME_WIDTH }}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="truncate">{student.name}</span>
                  {student.probation && (
                    <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">Probation</Badge>
                  )}
                  {student.withdrawn && (
                    <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">Withdrawn</Badge>
                  )}
                </div>
              </TableCell>
              {student.examMarks.map((mark) => (
                <TableCell key={mark.examId} className="border-b text-right tabular-nums text-muted-foreground">
                  {mark.rawMark ?? <span className="text-muted-foreground/50">—</span>}
                </TableCell>
              ))}
              {hasQuizzes && (
                <TableCell className="border-b text-right tabular-nums text-muted-foreground">
                  {student.quizAggregated ?? <span className="text-muted-foreground/50">—</span>}
                </TableCell>
              )}
              {hasAssignments && (
                <TableCell className="border-b text-right tabular-nums text-muted-foreground">
                  {student.assignmentAggregated ?? <span className="text-muted-foreground/50">—</span>}
                </TableCell>
              )}
              {hasProjects && (
                <TableCell className="border-b text-right tabular-nums text-muted-foreground">
                  {student.projectAggregated ?? <span className="text-muted-foreground/50">—</span>}
                </TableCell>
              )}
              <TableCell className="border-b text-right font-semibold tabular-nums">
                {student.withdrawn ? 'W' : student.finalMarks ?? '—'}
              </TableCell>
              <TableCell className={cn('sticky right-0 z-10 border-b border-l text-right', zebra)}>
                <div className="flex justify-end">
                  <GradeBadge letter={student.letter} modifier={student.modifier} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
