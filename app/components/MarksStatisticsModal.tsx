'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TrendingUp, TrendingDown, Gauge, Target } from 'lucide-react';
import { computeAllCategoryStats, CategoryStatEntry, StatExam, StatMark, StatStudent } from '@/lib/markStats';

interface MarksStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StatStudent[];
  exams: StatExam[];
  marks: StatMark[];
}

function EntryLine({ entry, tone }: { entry: CategoryStatEntry; tone: 'high' | 'low' | 'avg' }) {
  const toneClass = tone === 'high' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'low' ? 'text-amber-600 dark:text-amber-400' : 'text-primary';
  return (
    <div>
      <div className="font-medium">{entry.student.name}</div>
      <div className="text-xs text-muted-foreground">{entry.student.studentId}</div>
      <div className={`text-sm font-semibold mt-0.5 ${toneClass}`}>
        {entry.obtained} / {entry.total} <span className="text-xs font-normal text-muted-foreground">({entry.percentage.toFixed(1)}%)</span>
      </div>
    </div>
  );
}

export default function MarksStatisticsModal({ isOpen, onClose, students, exams, marks }: MarksStatisticsModalProps) {
  const stats = computeAllCategoryStats(exams, students, marks);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            Marks Statistics
          </DialogTitle>
          <DialogDescription>
            Highest, lowest, and closest-to-average for Midterm, Final, and Project / OEL. Withdrawn students are excluded.
          </DialogDescription>
        </DialogHeader>

        {stats.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
            No midterm, final, or project marks entered yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map(cat => (
              <div key={cat.key} className="border rounded-lg p-4 space-y-4">
                <div>
                  <div className="font-semibold">{cat.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {cat.entries.length} of {students.filter(s => !s.withdrawn).length} students · avg {cat.average !== null ? `${cat.average.toFixed(1)}%` : '—'}
                  </div>
                </div>

                {cat.entries.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No complete marks entered yet.</div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                        <TrendingUp className="w-3.5 h-3.5" /> Highest
                      </div>
                      {cat.highest && <EntryLine entry={cat.highest} tone="high" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
                        <TrendingDown className="w-3.5 h-3.5" /> Lowest
                      </div>
                      {cat.lowest && <EntryLine entry={cat.lowest} tone="low" />}
                    </div>
                    {cat.lowestNonZero && cat.lowest && cat.lowestNonZero.student._id !== cat.lowest.student._id && (
                      <div>
                        <div className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
                          <TrendingDown className="w-3.5 h-3.5" /> Lowest (non-zero)
                        </div>
                        <EntryLine entry={cat.lowestNonZero} tone="low" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1 text-xs font-medium text-primary mb-1">
                        <Target className="w-3.5 h-3.5" /> Closest to average
                      </div>
                      {cat.closestToAverage && <EntryLine entry={cat.closestToAverage} tone="avg" />}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
