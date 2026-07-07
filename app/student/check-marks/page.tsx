'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { notify } from '@/app/utils/notifications';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

import { SearchForm } from './components/SearchForm';
import { StudentSummary } from './components/StudentSummary';
import { CourseCard } from './components/CourseCard';
import { CourseDetailModal } from './components/CourseDetailModal';
import { EmptyState } from './components/EmptyState';
import { InstructionsPanel } from './components/InstructionsPanel';
import type { CourseData } from './types';

export default function StudentCheckMarks() {
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseData | null>(null);
  const [showCourseModal, setShowCourseModal] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setSearched(false);
    setCourses([]);

    try {
      const response = await fetch(`/api/student/marks?studentId=${encodeURIComponent(studentId)}`);
      const data = await response.json();

      if (response.ok) {
        setCourses(data.courses);
        setStudentName(data.studentName);
        setSearched(true);
        if (data.courses.length > 0) {
          notify.success(`Found ${data.courses.length} course${data.courses.length !== 1 ? 's' : ''} for ${data.studentName}`);
        }
      } else {
        notify.student.notFound(studentId);
        setError(data.error || 'Student ID not found');
        setSearched(true);
      }
    } catch {
      setError('An error occurred while fetching marks');
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Image src="/ulab.svg" alt="ULAB Logo" width={44} height={44} className="drop-shadow-lg" />
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Check Your Marks
                </h1>
                <p className="text-xs text-muted-foreground">Student Self-Service Portal</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="outline" asChild>
                <Link href="/auth/signin">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Sign In
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-4 pt-8">
        <SearchForm
          studentId={studentId}
          onStudentIdChange={setStudentId}
          onSubmit={handleSearch}
          loading={loading}
          error={error}
        />

        {searched && courses.length > 0 && (
          <>
            <StudentSummary studentName={studentName} studentId={studentId} courseCount={courses.length} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courses.map((courseData) => (
                <CourseCard
                  key={courseData.course._id}
                  courseData={courseData}
                  onSelect={() => {
                    setSelectedCourse(courseData);
                    setShowCourseModal(true);
                  }}
                />
              ))}
            </div>
          </>
        )}

        <CourseDetailModal courseData={selectedCourse} open={showCourseModal} onOpenChange={setShowCourseModal} />

        {searched && courses.length === 0 && !error && <EmptyState studentId={studentId} />}

        {!searched && <InstructionsPanel />}
      </div>
    </div>
  );
}
