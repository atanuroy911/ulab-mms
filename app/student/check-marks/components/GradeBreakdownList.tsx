'use client';

import { BarChart3, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FinalGradeResult } from '../types';

interface GradeBreakdownListProps {
  gradeData: FinalGradeResult;
}

export function GradeBreakdownList({ gradeData }: GradeBreakdownListProps) {
  return (
    <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/10">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Grade Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {gradeData.breakdown.map((item, idx) => (
            <div
              key={idx}
              className={`flex flex-wrap items-center justify-between gap-2 text-xs p-2 rounded-md ${
                item.isAggregated ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/60'
              }`}
            >
              <div className="flex items-center gap-2">
                {item.isAggregated && <Layers className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
                <span>{item.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-600 dark:text-blue-400">
                  {item.mark.toFixed(2)}/{item.totalMarks}
                </span>
                <span className="text-purple-600 dark:text-purple-400">
                  {item.isAggregated ? 'weighted' : `${((item.mark / item.totalMarks) * 100).toFixed(1)}%`}
                </span>
                <span className="text-muted-foreground">&times;</span>
                <span className="text-cyan-600 dark:text-cyan-400">{item.weightage}%</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold min-w-12 text-right">
                  {item.contribution.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md font-semibold mt-2">
            <span>Total Points:</span>
            <span className="text-base text-emerald-600 dark:text-emerald-400">{gradeData.total.toFixed(2)}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
