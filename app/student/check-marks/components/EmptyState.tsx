'use client';

import { SearchX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

interface EmptyStateProps {
  studentId: string;
}

export function EmptyState({ studentId }: EmptyStateProps) {
  return (
    <Card className="text-center py-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CardContent>
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md">
          <SearchX className="h-7 w-7" />
        </div>
        <CardTitle className="mb-2">No Results Found</CardTitle>
        <CardDescription>No records found for Student ID: {studentId}</CardDescription>
      </CardContent>
    </Card>
  );
}
