'use client';

import { useMemo } from 'react';
import { BookOpen, FlaskConical, Info, Inbox, ClipboardList } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GradeSummaryCard } from './GradeSummaryCard';
import { GradeBreakdownList } from './GradeBreakdownList';
import { ExamCard } from './ExamCard';
import { calculateFinalGrade, calculateGradeProjections } from '../lib/grade-calculations';
import type { CourseData } from '../types';

interface CourseDetailModalProps {
  courseData: CourseData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CourseDetailModal({ courseData, open, onOpenChange }: CourseDetailModalProps) {
  const gradeData = useMemo(() => (courseData ? calculateFinalGrade(courseData) : null), [courseData]);
  const projections = useMemo(
    () => (courseData && gradeData ? calculateGradeProjections(courseData, gradeData) : null),
    [courseData, gradeData]
  );

  if (!courseData || !gradeData) return null;

  const Icon = courseData.course.courseType === 'Theory' ? BookOpen : FlaskConical;
  const hasGradeSummary = courseData.marks.length > 0 && gradeData.breakdown.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[1400px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>{courseData.course.name}</DialogTitle>
              <DialogDescription>
                {courseData.course.code} &middot; {courseData.course.semester} {courseData.course.year}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {hasGradeSummary && (
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 lg:order-2">
              <GradeSummaryCard courseData={courseData} gradeData={gradeData} projections={projections} />
            </div>
            <div className="lg:col-span-2 lg:order-1 space-y-4">
              <GradeBreakdownList gradeData={gradeData} />
            </div>
          </div>
        )}

        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Exam Details
          </h3>

          {courseData.exams.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No exams configured for this course yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courseData.exams.map((exam) => (
                <ExamCard
                  key={exam._id}
                  exam={exam}
                  marks={courseData.marks}
                  stats={courseData.classStats.find(s => s.examId === exam._id)}
                />
              ))}
            </div>
          )}
        </div>

        {courseData.course.showFinalGrade && courseData.marks.length > 0 && (
          <Card className="mt-6 bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>
                <strong>Note:</strong> Your estimated grade is calculated based on completed exams using weighted scoring.
              </p>
              {(courseData.exams.some(e => e.examCategory === 'Quiz') || courseData.exams.some(e => e.examCategory === 'Assignment')) && (
                <p>
                  Quiz and Assignment marks are aggregated using the{' '}
                  <strong>{courseData.course.quizAggregation === 'best' ? 'Best' : 'Average'}</strong> method for quizzes
                  and <strong>{courseData.course.assignmentAggregation === 'best' ? 'Best' : 'Average'}</strong> method for assignments.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
