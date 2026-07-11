'use client';

import { SearchX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

interface EmptyStateProps {
  studentId: string;
}

export function EmptyState({ studentId }: EmptyStateProps) {
  return (
    <Card className="text-center py-12">
      <CardContent>
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <SearchX className="h-7 w-7 text-muted-foreground" />
        </div>
        <CardTitle className="mb-2">No Results Found</CardTitle>
        <CardDescription>No records found for Student ID: {studentId}</CardDescription>
      </CardContent>
    </Card>
  );
}
