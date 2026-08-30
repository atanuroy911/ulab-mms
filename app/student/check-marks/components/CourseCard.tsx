'use client';

import { BookOpen, FlaskConical, ChevronRight, Archive, CalendarCheck, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { calculateFinalGrade, calculateTotalWeightage } from '../lib/grade-calculations';
import type { CourseData } from '../types';

interface CourseCardProps {
  courseData: CourseData;
  onSelect: () => void;
}

export function CourseCard({ courseData, onSelect }: CourseCardProps) {
  const gradeData = calculateFinalGrade(courseData);
  const totalWeightage = calculateTotalWeightage(courseData.exams);
  const marksCount = courseData.marks.length;
  const examsCount = courseData.exams.length;
  const Icon = courseData.course.courseType === 'Theory' ? BookOpen : FlaskConical;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      className="cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white ${
            courseData.course.courseType === 'Theory' ? 'from-blue-600 to-cyan-600' : 'from-purple-600 to-pink-600'
          }`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base leading-snug">{courseData.course.name}</CardTitle>
            <CardDescription>
              {courseData.course.code} &middot; {courseData.course.semester} {courseData.course.year}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={courseData.course.courseType === 'Theory' ? 'default' : 'secondary'}>
            {courseData.course.courseType}
          </Badge>
          {courseData.course.isArchived && (
            <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
              <Archive className="h-3 w-3" />
              Past Semester
            </Badge>
          )}
          {courseData.student.withdrawn && (
            <Badge variant="outline" className="gap-1 text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/10">
              <UserX className="h-3 w-3" />
              Withdrawn
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {marksCount}/{examsCount} exams
          </span>
          {!courseData.student.withdrawn && courseData.course.showFinalGrade && marksCount > 0 && (
            <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
              {totalWeightage > 0 ? `${((gradeData.total / totalWeightage) * 100).toFixed(1)}%` : 'N/A'}
            </Badge>
          )}
          {courseData.attendance.totalSessions > 0 && (
            <Badge variant="outline" className="gap-1 text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10">
              <CalendarCheck className="h-3 w-3" />
              {courseData.attendance.percentage.toFixed(0)}% attendance
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm font-medium text-primary">
          View detailed marks
          <ChevronRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
