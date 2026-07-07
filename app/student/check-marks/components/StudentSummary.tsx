'use client';

import { GraduationCap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface StudentSummaryProps {
  studentName: string;
  studentId: string;
  courseCount: number;
}

export function StudentSummary({ studentName, studentId, courseCount }: StudentSummaryProps) {
  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <GraduationCap className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{studentName}</h2>
            <p className="text-sm text-muted-foreground">Student ID: {studentId}</p>
            <Badge variant="secondary" className="mt-2">
              Enrolled in {courseCount} course{courseCount !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
