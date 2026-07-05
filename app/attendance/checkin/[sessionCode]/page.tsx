"use client";

import { useEffect, useState, use } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface CourseInfo {
  _id: string;
  name: string;
  code: string;
  section: string;
  semester: string;
  year: number;
  open: boolean;
  dateLabel: string;
  dateISO?: string;
  activeSessionDateISO?: string | null;
  hasActiveSession: boolean;
}

interface ConfirmationCandidate {
  studentId: string;
  name: string;
}

export default function AttendanceCheckInPage({ params }: { params: Promise<{ sessionCode: string }> }) {
  const { data: session, status } = useSession();
  const resolvedParams = use(params);
  const courseId = resolvedParams.sessionCode;
  const searchParams = useSearchParams();
  const shouldAutoCheckIn = searchParams.get('attendance') === '1';
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [message, setMessage] = useState('Preparing check-in...');
  const [signingIn, setSigningIn] = useState(false);
  const [attendanceSubmitted, setAttendanceSubmitted] = useState(false);
  const [attendanceCompleted, setAttendanceCompleted] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<ConfirmationCandidate | null>(null);
  const [confirmingAttendance, setConfirmingAttendance] = useState(false);

  const activeSessionDateKey = course?.activeSessionDateISO ? new Date(course.activeSessionDateISO).toISOString() : '';

  const buildCallbackUrl = () => {
    return `${window.location.origin}/attendance/checkin/${courseId}?attendance=1`;
  };

  const fetchCourseInfo = async () => {
    try {
      const res = await fetch(`/api/attendance/course/${courseId}`);
      const data = await res.json();
      if (res.ok) {
        setCourse(data.course);
        if (!data.course?.hasActiveSession) {
          setMessage('Attendance is currently closed. Please wait for the instructor to open the session.');
        }
      } else {
        setMessage(data.error || 'Unable to load course info');
      }
    } catch {
      setMessage('Network error while loading course info');
    }
  };

  useEffect(() => {
    fetchCourseInfo();
  }, [courseId]);

  useEffect(() => {
    if (
      status !== 'authenticated' ||
      !session?.user?.email ||
      !course?.hasActiveSession ||
      !shouldAutoCheckIn ||
      attendanceSubmitted ||
      pendingCandidate
    ) {
      return;
    }

    const markAttendance = async () => {
      setAttendanceSubmitted(true);
      setMessage('Recording attendance...');
      try {
        const res = await fetch('/api/attendance/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courseId, sessionDateISO: activeSessionDateKey }),
        });
        const data = await res.json();
        if (res.ok) {
          if (data.needsConfirmation && data.candidate) {
            setPendingCandidate(data.candidate);
            setMessage(data.message || 'Please confirm your name and student ID.');
            return;
          }

          setAttendanceCompleted(true);
          setMessage(data.message || 'Attendance recorded successfully.');
        } else {
          setMessage(data.error || 'Unable to record attendance');
        }
      } catch {
        setMessage('Network error while recording attendance');
      }
    };

    markAttendance();
  }, [status, session, course?.hasActiveSession, courseId, shouldAutoCheckIn, attendanceSubmitted, activeSessionDateKey]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    const callbackUrl = buildCallbackUrl();
    await signIn('google-checkin', { callbackUrl });
  };

  const confirmAttendance = async () => {
    if (!pendingCandidate) return;

    setConfirmingAttendance(true);
    setMessage('Recording attendance...');

    try {
      const res = await fetch('/api/attendance/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, confirmedStudentId: pendingCandidate.studentId, sessionDateISO: activeSessionDateKey }),
      });
      const data = await res.json();

      if (res.ok) {
        setPendingCandidate(null);
        setAttendanceSubmitted(true);
        setAttendanceCompleted(true);
        setMessage(data.message || 'Attendance recorded successfully.');
      } else {
        setMessage(data.error || 'Unable to record attendance');
      }
    } catch {
      setMessage('Network error while recording attendance');
    } finally {
      setConfirmingAttendance(false);
    }
  };

  return (
    <main className="min-h-screen bg-linear-to-b from-background via-background to-muted/30 px-4 py-4 sm:py-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 sm:max-w-2xl">
        <Card className="overflow-hidden border-2 shadow-xl">
          <CardContent className="p-0">
            <div className="bg-linear-to-br from-emerald-600 via-green-600 to-teal-600 px-5 py-6 text-white sm:px-6 sm:py-8">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/80">Attendance Check-in</p>
                  <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">{course ? course.name : 'Loading course...'}</h1>
                  <p className="mt-2 text-sm text-white/90 sm:text-base">
                    {course ? `${course.code} • Section ${course.section}` : 'Please wait...'}
                  </p>
                </div>
                <Badge className="bg-white/15 text-white hover:bg-white/20">{course ? course.semester : '...'}</Badge>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-xl border bg-muted/40 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Code</div>
                  <div className="mt-1 font-semibold">{course?.code || '-'}</div>
                </div>
                <div className="rounded-xl border bg-muted/40 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Section</div>
                  <div className="mt-1 font-semibold">{course?.section || '-'}</div>
                </div>
                <div className="rounded-xl border bg-muted/40 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Semester</div>
                  <div className="mt-1 font-semibold">{course ? `${course.semester} ${course.year}` : '-'}</div>
                </div>
                <div className="rounded-xl border bg-muted/40 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Date</div>
                  <div className="mt-1 font-semibold">{course?.dateISO ? new Date(course.dateISO).toLocaleDateString() : (course?.dateLabel || '—')}</div>
                </div>
              </div>

              <Separator />

              {!attendanceCompleted ? (
                <div className="rounded-2xl border bg-background p-4 sm:p-5">
                  <p className="text-sm text-muted-foreground">Sign in with your ULAB Google account to continue. After Google sign-in, this page will come back here and complete attendance automatically.</p>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={signingIn || !course?.hasActiveSession}
                      className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto"
                    >
                      {signingIn ? 'Redirecting to Google...' : 'Sign in with Google'}
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      {course?.hasActiveSession
                        ? 'Attendance is open now.'
                        : 'Attendance is closed right now.'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Thank you</div>
                  <div className="mt-2 text-sm text-foreground">Your attendance has been recorded successfully.</div>
                </div>
              )}

              {pendingCandidate && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Confirmation required
                  </div>
                  <div className="mt-2 text-sm leading-6 text-foreground">
                    Is this you?
                  </div>
                  <div className="mt-2 rounded-xl border bg-background px-3 py-3">
                    <div className="text-sm font-semibold">{pendingCandidate.name}</div>
                    <div className="text-sm text-muted-foreground">ID: {pendingCandidate.studentId}</div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      onClick={confirmAttendance}
                      disabled={confirmingAttendance}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {confirmingAttendance ? 'Confirming...' : 'Yes, this is me'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPendingCandidate(null)}
                      disabled={confirmingAttendance}
                    >
                      No, cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className={`rounded-2xl border border-dashed p-4 ${!course?.hasActiveSession ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/20'}`}>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</div>
                <div className="mt-2 text-sm leading-6">{message}</div>
                {shouldAutoCheckIn && session?.user?.email && (
                  <div className="mt-3 text-sm text-muted-foreground">Signed in as {session.user.email}</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
