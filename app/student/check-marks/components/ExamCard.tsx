'use client';

import { FileText, FileQuestion, ListChecks, PenLine } from 'lucide-react';
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
  const mark = getMark(marks, exam._id);
  const weightedValue = mark
    ? (mark.weightedMark !== undefined && mark.weightedMark !== null
        ? mark.weightedMark
        : (mark.rawMark / exam.totalMarks) * exam.weightage)
    : null;

  return (
    <Card className={mark ? 'border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-purple-500/5 hover:border-blue-500/50' : 'hover:border-primary/50'}>
      <CardContent className="pt-6">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="font-semibold text-base">{exam.displayName}</h4>
            {exam.examCategory && (
              <Badge variant="secondary" className="shrink-0">{exam.examCategory}</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Total: {exam.totalMarks} marks
              </span>
              {exam.numberOfCOs && (
                <span className="text-purple-600 dark:text-purple-400">&middot; {exam.numberOfCOs} COs</span>
              )}
              {exam.numberOfQuestions && (
                <span className="text-cyan-600 dark:text-cyan-400">&middot; {exam.numberOfQuestions} Questions</span>
              )}
            </div>
            {exam.examCategory !== 'Quiz' && exam.examCategory !== 'Assignment' && (
              <div>Weightage: {exam.weightage}%</div>
            )}
          </div>
        </div>

        {mark ? (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <Card className="bg-blue-500/10 border-blue-500/20">
                <CardContent className="p-3 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Raw</div>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{mark.rawMark}</div>
                  <div className="text-xs text-muted-foreground">/{exam.totalMarks}</div>
                </CardContent>
              </Card>
              <Card className="bg-emerald-500/10 border-emerald-500/20">
                <CardContent className="p-3 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Weighted</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {weightedValue!.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {stats && <PerformanceComparison studentMark={mark.rawMark} stats={stats} />}

            {mark.coMarks && mark.coMarks.length > 0 && (
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

            {mark.questionMarks && mark.questionMarks.length > 0 && (
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
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <PenLine className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <div className="text-sm">Marks not recorded yet</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
