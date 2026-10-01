'use client';

import { BookOpen, FlaskConical } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CourseReportBody } from './CourseReportBody';
import type { CourseData } from '../types';

interface CourseDetailModalProps {
  courseData: CourseData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CourseDetailModal({ courseData, open, onOpenChange }: CourseDetailModalProps) {
  if (!courseData) return null;

  const Icon = courseData.course.courseType === 'Theory' ? BookOpen : FlaskConical;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[1400px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white ${
              courseData.course.courseType === 'Theory' ? 'from-blue-600 to-cyan-600' : 'from-purple-600 to-pink-600'
            }`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>{courseData.course.name}</DialogTitle>
              <DialogDescription>
                {courseData.course.code} &middot; {courseData.course.semester} {courseData.course.year}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <CourseReportBody courseData={courseData} />
      </DialogContent>
    </Dialog>
  );
}
