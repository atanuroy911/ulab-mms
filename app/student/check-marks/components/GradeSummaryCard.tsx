'use client';

import { Target, PartyPopper, GraduationCap, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateLetterGrade, getGradeDisplay, getGradeColor } from '@/app/utils/grading';
import type { CourseData, FinalGradeResult, GradeProjections } from '../types';

const TARGET_COLOR_CLASSES: Record<GradeProjections['estimates'][number]['color'], { text: string; bar: string }> = {
  green: { text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  blue: { text: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500' },
  yellow: { text: 'text-yellow-600 dark:text-yellow-400', bar: 'bg-yellow-500' },
  orange: { text: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500' },
};

interface GradeSummaryCardProps {
  courseData: CourseData;
  gradeData: FinalGradeResult;
  projections: GradeProjections | null;
}

export function GradeSummaryCard({ courseData, gradeData, projections }: GradeSummaryCardProps) {
  const letterGrade = gradeData.total > 0
    ? calculateLetterGrade(gradeData.total, courseData.course.gradingScale)
    : null;

  if (courseData.student.withdrawn) {
    return (
      <Card className="lg:sticky lg:top-4 bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            Your Estimated Grade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <UserX className="h-10 w-10 mx-auto mb-3 text-red-600 dark:text-red-400" />
            <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-1">W</div>
            <div className="text-sm text-muted-foreground">
              You are recorded as withdrawn from this course
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:sticky lg:top-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          Your Estimated Grade
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center mb-2">
          {letterGrade && (
            <div>
              <div className={`text-6xl font-bold mb-2 animate-in zoom-in-50 duration-500 delay-100 fill-mode-backwards ${getGradeColor(letterGrade.letter)}`}>
                {letterGrade.letter}
                {letterGrade.modifier === '1' ? '-' : letterGrade.modifier === '2' ? '+' : ''}
              </div>
              <div className="text-sm text-muted-foreground mb-1">
                {getGradeDisplay(letterGrade.letter, letterGrade.modifier)}
              </div>
              <div className="text-3xl font-bold text-primary mb-1">
                {gradeData.total.toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground">Current weighted score</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {courseData.marks.length}
              </div>
              <div className="text-xs text-muted-foreground">Exams Taken</div>
            </CardContent>
          </Card>
          <Card className="bg-emerald-500/10 border-emerald-500/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {courseData.exams.length - courseData.marks.length}
              </div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </CardContent>
          </Card>
        </div>

        {projections && projections.estimates.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-3 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              Grade Targets
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {projections.estimates.slice(0, 6).map((est) => {
                const colors = TARGET_COLOR_CLASSES[est.color];
                return (
                  <Card key={est.grade} className="bg-card/60">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-lg font-bold ${colors.text}`}>{est.grade}</span>
                        <span className="text-xl font-bold text-primary">
                          {est.averageNeeded.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Need avg {est.averageNeeded.toFixed(1)}% in remaining exams
                      </div>
                      <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${colors.bar}`}
                          style={{ width: `${Math.min(est.averageNeeded, 100)}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Card className="mt-3 bg-primary/10 border-primary/20">
              <CardContent className="p-2 text-xs text-primary">
                These are the average percentages you need in remaining exams to achieve each grade.
              </CardContent>
            </Card>
          </div>
        )}

        {!projections && (
          <Card className="bg-emerald-500/10 border-emerald-500/20">
            <CardContent className="pt-6 text-center">
              <PartyPopper className="h-8 w-8 mx-auto mb-2 text-emerald-600 dark:text-emerald-400" />
              <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                All exams completed!
              </div>
              <div className="text-xs text-muted-foreground mt-1">This is your final grade</div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
