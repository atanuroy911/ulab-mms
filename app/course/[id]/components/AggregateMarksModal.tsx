'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface Student {
  _id: string;
  studentId: string;
  name: string;
}

interface Exam {
  _id: string;
  displayName: string;
  totalMarks: number;
  weightage?: number;
}

interface Mark {
  studentId: string;
  examId: string;
  rawMark: number;
}

interface AggregateMarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  categoryLabel: string;
  exams: Exam[];
  marks: Mark[];
  aggregationMethod: 'average' | 'best' | 'sum' | 'direct';
  weightage: number;
  /** Final aggregated value out of `weightage` (already computed by getAggregatedMark/getProjectAggregatedMark/summed contributions). */
  aggregatedValue: number | null;
}

const METHOD_EXPLANATION: Record<'average' | 'best' | 'sum' | 'direct', string> = {
  average: 'Each exam is converted to a percentage, then averaged, then scaled to the weightage.',
  best: 'The single highest-percentage exam is scaled to the weightage - the rest are ignored.',
  sum: 'Raw marks and totals are summed across all exams, then that combined percentage is scaled to the weightage.',
  direct: 'Each exam contributes its own percentage × weightage directly to the total - contributions are summed, not aggregated into one score.',
};

export default function AggregateMarksModal({
  isOpen,
  onClose,
  student,
  categoryLabel,
  exams,
  marks,
  aggregationMethod,
  weightage,
  aggregatedValue,
}: AggregateMarksModalProps) {
  const rows = exams.map(exam => {
    const mark = marks.find(m => m.studentId === student?._id && m.examId === exam._id);
    const percentage = mark && exam.totalMarks > 0 ? (mark.rawMark / exam.totalMarks) * 100 : null;
    return { exam, mark, percentage };
  });

  const bestExamId = (() => {
    if (aggregationMethod !== 'best') return null;
    let bestId: string | null = null;
    let bestPct = -1;
    for (const row of rows) {
      if (row.percentage !== null && row.percentage > bestPct) {
        bestPct = row.percentage;
        bestId = row.exam._id;
      }
    }
    return bestId;
  })();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{categoryLabel} Breakdown</DialogTitle>
          <DialogDescription>
            {student ? `${student.name} (${student.studentId})` : ''}
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
            No {categoryLabel.toLowerCase()} exams in this course.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exam</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mark</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">%</th>
                    {aggregationMethod === 'direct' && (
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contribution</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map(({ exam, mark, percentage }, idx) => (
                    <tr key={exam._id} className={`${idx % 2 === 0 ? 'bg-muted/20' : ''} ${exam._id === bestExamId ? 'bg-emerald-500/10' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {exam.displayName}
                          {exam._id === bestExamId && <Badge variant="secondary" className="text-[10px]">Best</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {mark ? `${mark.rawMark} / ${exam.totalMarks}` : <span className="italic">Not entered</span>}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {percentage !== null ? `${percentage.toFixed(1)}%` : '—'}
                      </td>
                      {aggregationMethod === 'direct' && (
                        <td className="px-3 py-2 font-medium">
                          {percentage !== null && exam.weightage !== undefined
                            ? `${((percentage / 100) * exam.weightage).toFixed(2)} / ${exam.weightage}`
                            : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm space-y-1.5">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground capitalize">{aggregationMethod}</span> aggregation: {METHOD_EXPLANATION[aggregationMethod]}
              </p>
              <p className="font-semibold">
                Result: {aggregatedValue !== null ? aggregatedValue.toFixed(2) : '0'} / {weightage}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
