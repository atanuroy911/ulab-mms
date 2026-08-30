'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight } from 'lucide-react';

interface BreakdownItem {
  name: string;
  mark: number;
  totalMarks: number;
  weightage: number;
  contribution: number;
  isAggregated?: boolean;
}

interface GradeResult {
  total: number;
  breakdown: BreakdownItem[];
}

interface GracedColumn {
  examName: string;
  before: number;
  after: number;
}

interface Student {
  _id: string;
  name: string;
  studentId: string;
}

interface GraceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  previousGrade: GradeResult | null;
  currentGrade: GradeResult | null;
  previousGradeDisplay: string;
  currentGradeDisplay: string;
  gracedColumns: GracedColumn[];
}

function BreakdownTable({ data }: { data: GradeResult }) {
  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exam</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mark</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contribution</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {data.breakdown.map((item, idx) => (
            <tr key={idx} className={idx % 2 === 0 ? 'bg-muted/20' : ''}>
              <td className="px-3 py-2">{item.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{item.mark.toFixed(2)} / {item.totalMarks}</td>
              <td className="px-3 py-2 font-medium">{item.contribution.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/50">
          <tr>
            <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold">Total:</td>
            <td className="px-3 py-2 font-bold">{data.total.toFixed(2)}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function GraceHistoryModal({
  isOpen,
  onClose,
  student,
  previousGrade,
  currentGrade,
  previousGradeDisplay,
  currentGradeDisplay,
  gracedColumns,
}: GraceHistoryModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            Grace History
          </DialogTitle>
          <DialogDescription>
            {student ? `${student.name} (${student.studentId})` : ''} - breakdown before and after grace was applied.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3 py-1">
          <Badge variant="secondary" className="text-sm px-3 py-1">{previousGradeDisplay}</Badge>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <Badge className="text-sm px-3 py-1 bg-violet-600 hover:bg-violet-600">{currentGradeDisplay}</Badge>
        </div>

        {gracedColumns.length > 0 && (
          <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg text-sm space-y-1">
            {gracedColumns.map((c, idx) => (
              <div key={idx}>
                <span className="font-medium">{c.examName}:</span> {c.before} &rarr; {c.after}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Before Grace</div>
            {previousGrade && previousGrade.breakdown.length > 0 ? (
              <BreakdownTable data={previousGrade} />
            ) : (
              <div className="text-sm text-muted-foreground border-2 border-dashed rounded-lg py-6 text-center">No data</div>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">After Grace</div>
            {currentGrade && currentGrade.breakdown.length > 0 ? (
              <BreakdownTable data={currentGrade} />
            ) : (
              <div className="text-sm text-muted-foreground border-2 border-dashed rounded-lg py-6 text-center">No data</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
