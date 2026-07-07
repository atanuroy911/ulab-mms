'use client';

import { BarChart3, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ClassStats } from '../types';

interface PerformanceComparisonProps {
  studentMark: number;
  stats: ClassStats;
}

function Bar({ label, value, max, colorClass, icon }: { label: React.ReactNode; value: number; max: number; colorClass: string; icon?: React.ReactNode }) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-12 flex items-center gap-1 shrink-0">
        {icon}
        {label}
      </span>
      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} flex items-center justify-end pr-2 transition-all`}
          style={{ width: `${percent}%` }}
        >
          <span className="text-[11px] font-semibold text-white">{value.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

export function PerformanceComparison({ studentMark, stats }: PerformanceComparisonProps) {
  if (stats.count === 0) return null;

  return (
    <Card className="bg-indigo-500/5 border-indigo-500/20">
      <CardContent className="p-3">
        <div className="text-xs font-medium mb-3 flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
          <span>Class Performance</span>
          <span className="ml-auto text-muted-foreground">({stats.count} students)</span>
        </div>

        <div className="space-y-2">
          <Bar label="High" value={stats.highest} max={stats.highest} colorClass="bg-gradient-to-r from-emerald-600 to-emerald-400" />
          <Bar
            label="You"
            value={studentMark}
            max={stats.highest}
            colorClass="bg-gradient-to-r from-blue-600 to-blue-400"
            icon={<User className="h-3 w-3" />}
          />
          <Bar label="Avg" value={stats.average} max={stats.highest} colorClass="bg-gradient-to-r from-yellow-600 to-yellow-400" />
          <Bar label="Low" value={stats.lowest} max={stats.highest} colorClass="bg-gradient-to-r from-red-600 to-red-400" />
        </div>

        <div className="mt-3 text-center">
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${
              studentMark >= stats.average
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
            }`}
          >
            {studentMark >= stats.average ? 'Above Average' : 'Below Average'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
