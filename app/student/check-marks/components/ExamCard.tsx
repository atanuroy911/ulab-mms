'use client';

import { useState } from 'react';
import { ChevronDown, FileText, FileQuestion, ListChecks, PenLine } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PerformanceComparison } from './PerformanceComparison';
import { getMark } from '../lib/grade-calculations';
import type { ClassStats, CourseData, Exam } from '../types';

interface ExamCardProps {
  exam: Exam;
  marks: CourseData['marks'];
  stats?: ClassStats;
}

export function ExamCard({ exam, marks, stats }: ExamCardProps) {
  const [expanded, setExpanded] = useState(false);
  const mark = getMark(marks, exam._id);
  const weightedValue = mark
    ? (mark.weightedMark !== undefined && mark.weightedMark !== null
        ? mark.weightedMark
        : (mark.rawMark / exam.totalMarks) * exam.weightage)
    : null;
  const hasDetails = !!(mark && (stats || (mark.coMarks && mark.coMarks.length > 0) || (mark.questionMarks && mark.questionMarks.length > 0)));

  return (
    <Card className={mark ? 'border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-purple-500/5 hover:border-blue-500/50' : 'hover:border-primary/50'}>
      <button
        type="button"
        onClick={() => hasDetails && setExpanded(v => !v)}
        className={`w-full text-left p-4 ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="font-semibold text-sm sm:text-base truncate">{exam.displayName}</h4>
              {exam.examCategory && (
                <Badge variant="secondary" className="shrink-0">{exam.examCategory}</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {exam.totalMarks} marks
              </span>
              {exam.examCategory !== 'Quiz' && exam.examCategory !== 'Assignment' && (
                <span>&middot; {exam.weightage}% weightage</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {mark ? (
              <div className="text-right">
                <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {mark.rawMark}/{exam.totalMarks}
                </div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400">
                  {weightedValue!.toFixed(2)} wtd
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <PenLine className="h-3.5 w-3.5" />
                Pending
              </div>
            )}
            {hasDetails && (
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
            )}
          </div>
        </div>
      </button>

      {expanded && hasDetails && (
        <CardContent className="pt-0 pb-4">
          {stats && <PerformanceComparison studentMark={mark!.rawMark} stats={stats} />}

          {mark?.coMarks && mark.coMarks.length > 0 && (
            <Card className="mt-3 bg-muted/30">
              <CardContent className="p-3">
                <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  CO Breakdown
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {mark.coMarks.map((coMark, idx) => (
                    <div key={idx} className="text-center p-2 bg-muted rounded-md">
                      <div className="text-xs text-muted-foreground">CO{idx + 1}</div>
                      <div className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">{coMark}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {mark?.questionMarks && mark.questionMarks.length > 0 && (
            <Card className="mt-3 bg-indigo-500/5 border-indigo-500/20">
              <CardContent className="p-3">
                <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
                  <FileQuestion className="h-3.5 w-3.5" />
                  Question-wise Marks
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {mark.questionMarks.map((qMark, idx) => (
                    <div key={idx} className="text-center p-2 bg-indigo-500/10 rounded-md">
                      <div className="text-xs text-muted-foreground">Q{idx + 1}</div>
                      <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{qMark}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      )}
    </Card>
  );
}
