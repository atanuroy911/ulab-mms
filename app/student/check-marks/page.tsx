'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ClipboardList, UserX } from 'lucide-react';
import { notify } from '@/app/utils/notifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { Button } from '@/components/ui/button';
import { AppHeader } from '@/app/components/AppHeader';

import { AuthGate } from './components/AuthGate';
import { SearchForm } from './components/SearchForm';
import { StudentSummary } from './components/StudentSummary';
import { CourseCard } from './components/CourseCard';
import { CourseDetailModal } from './components/CourseDetailModal';
import { EmptyState } from './components/EmptyState';
import { InstructionsPanel } from './components/InstructionsPanel';
import type { CourseData } from './types';

export default function StudentCheckMarks() {
  const { data: session, status } = useSession();
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseData | null>(null);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [adminOverride, setAdminOverride] = useState(false);

  const isGoogleVerified =
    status === 'authenticated' &&
    !!session?.user?.email?.toLowerCase().endsWith('@ulab.edu.bd') &&
    !(session?.user as any)?.checkinOnly;
  const canSearch = isGoogleVerified || adminOverride;

  // Same convention as the attendance check-in flow: the student's Google display name is
  // expected to end with their ID in parentheses, e.g. "Jane Doe (2021-1-60-001)". We derive
  // the ID from that instead of asking them to type it, so a signed-in student can only ever
  // look up their own marks - letting them free-type any ID here would make the Google
  // sign-in gate pointless as a privacy boundary.
  const parsedStudentId = (() => {
    const match = (session?.user?.name || '').match(/\(([^)]+)\)/);
    return match ? match[1].trim() : null;
  })();
  const [nameIdMissing, setNameIdMissing] = useState(false);
  const autoFetchAttempted = useRef(false);

  const fetchMarks = async (id: string, adminPassword?: string) => {
    setError('');
    setLoading(true);
    setSearched(false);
    setCourses([]);

    try {
      const response = await fetch('/api/student/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: id, adminPassword }),
      });
      const data = await response.json();

      if (response.ok) {
        setCourses(data.courses);
        setStudentName(data.studentName);
        setStudentId(id);
        setSearched(true);
        if (adminPassword) {
          setAdminOverride(true);
        }
        if (data.courses.length > 0) {
          notify.success(`Found ${data.courses.length} course${data.courses.length !== 1 ? 's' : ''} for ${data.studentName}`);
        }
      } else {
        if (response.status === 401) {
          setError(data.error || 'Not authorized');
        } else {
          notify.student.notFound(id);
          setError(data.error || 'Student ID not found');
          setSearched(true);
        }
      }
    } catch {
      setError('An error occurred while fetching marks');
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchMarks(studentId);
  };

  const handleAdminOverride = async (id: string, adminPassword: string) => {
    await fetchMarks(id, adminPassword);
  };

  useEffect(() => {
    if (!isGoogleVerified || adminOverride || autoFetchAttempted.current) return;
    autoFetchAttempted.current = true;

    if (parsedStudentId) {
      fetchMarks(parsedStudentId);
    } else {
      setNameIdMissing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGoogleVerified, adminOverride, parsedStudentId]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl motion-safe:animate-blob" />
        <div className="absolute top-1/3 -right-16 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl motion-safe:animate-blob [animation-delay:2s]" />
      </div>

      <AppHeader
        title="Check Your Marks"
        subtitle="Student Self-Service Portal"
        icon={ClipboardList}
        logoHref="/auth/signin"
        actions={[
          { key: 'signin', label: 'Back to Sign In', icon: ArrowLeft, href: '/auth/signin', variant: 'outline', alwaysShowLabel: true },
        ]}
      />

      <div className="relative max-w-6xl mx-auto p-4 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {!canSearch ? (
          <AuthGate onAdminOverride={handleAdminOverride} loading={loading} error={error} />
        ) : isGoogleVerified && !adminOverride ? (
          loading ? (
            <div className="space-y-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-5 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            (nameIdMissing || error) && (
              <Card className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <UserX className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                  </div>
                  <CardTitle>{nameIdMissing ? "Couldn't identify your Student ID" : 'Unable to load your marks'}</CardTitle>
                  <CardDescription>
                    {nameIdMissing
                      ? <>Your Google account name doesn&apos;t include your Student ID in parentheses (e.g. &quot;Jane Doe (2021-1-60-001)&quot;). Update your Google profile name to include it, then reload this page. Ask your instructor or admin for help if you&apos;re unsure.</>
                      : error}
                  </CardDescription>
                </CardContent>
              </Card>
            )
          )
        ) : (
          <SearchForm
            studentId={studentId}
            onStudentIdChange={setStudentId}
            onSubmit={handleSearch}
            loading={loading}
            error={error}
          />
        )}

        {searched && courses.length > 0 && (
          <>
            <StudentSummary studentName={studentName} studentId={studentId} courseCount={courses.length} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courses.map((courseData, i) => (
                <div
                  key={courseData.course._id}
                  className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards"
                  style={{ animationDelay: `${Math.min(i, 8) * 60}ms`, animationDuration: '400ms' }}
                >
                  <CourseCard
                    courseData={courseData}
                    onSelect={() => {
                      setSelectedCourse(courseData);
                      setShowCourseModal(true);
                    }}
                  />
                </div>
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
