"use client";

import { useEffect, useState, use } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Calendar } from 'lucide-react';

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

interface AttendanceStats {
  totalSessions: number;
  attendedSessions: number;
  absentSessions: number;
  percentage: number;
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
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);

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

  const fetchAttendanceStats = async (studentId: string) => {
    try {
      const res = await fetch(`/api/student/attendance/${courseId}?studentId=${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setAttendanceStats({
          totalSessions: data.totalSessions,
          attendedSessions: data.attendedSessions,
          absentSessions: data.absentSessions,
          percentage: data.percentage,
        });
      }
    } catch (error) {
      console.error('Failed to fetch attendance stats:', error);
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

          // Fetch attendance stats after successful check-in
          if (data.studentId) {
            await fetchAttendanceStats(data.studentId);
          }
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

        // Fetch attendance stats
        if (pendingCandidate.studentId) {
          await fetchAttendanceStats(pendingCandidate.studentId);
        }
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

              {attendanceCompleted ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center rounded-2xl border-2 border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950">
                    <div className="text-center">
                      <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 dark:text-green-400" />
                      <p className="mt-3 text-lg font-semibold text-green-900 dark:text-green-100">{message}</p>
                    </div>
                  </div>

                  {attendanceStats && (
                    <div className="rounded-2xl border-2 bg-background p-5">
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                        <Calendar className="h-5 w-5 text-blue-600" />
                        Your Attendance for This Course
                      </h3>

                      <div className="mb-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                        <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950">
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {attendanceStats.attendedSessions}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Present</div>
                        </div>
                        <div className="rounded-lg bg-red-50 p-3 dark:bg-red-950">
                          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {attendanceStats.absentSessions}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Absent</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                          <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                            {attendanceStats.totalSessions}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
                        </div>
                        <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950">
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            {attendanceStats.percentage.toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Rate</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Progress</span>
                          <span className="text-gray-600 dark:text-gray-400">
                            {attendanceStats.attendedSessions} / {attendanceStats.totalSessions}
                          </span>
                        </div>
                        <Progress value={attendanceStats.percentage} className="h-2" />
                      </div>

                      {attendanceStats.percentage < 75 && (
                        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
                          ⚠️ Your attendance is below 75%. Please attend more classes.
                        </div>
                      )}

                      {attendanceStats.percentage >= 75 && attendanceStats.percentage < 90 && (
                        <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                          ℹ️ Good attendance! Keep it up.
                        </div>
                      )}

                      {attendanceStats.percentage >= 90 && (
                        <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
                          ✓ Excellent attendance!
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : !attendanceCompleted ? (
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
                    <p className="text-sm text-muted-foreground">{message}</p>
                  </div>

                  {pendingCandidate && (
                    <div className="mt-4 space-y-3 rounded-lg border bg-muted/40 p-4">
                      <p className="text-sm font-medium">Please confirm your details:</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="font-semibold">Name:</span> {pendingCandidate.name}</p>
                        <p><span className="font-semibold">Student ID:</span> {pendingCandidate.studentId}</p>
                      </div>
                      <Button
                        onClick={confirmAttendance}
                        disabled={confirmingAttendance}
                        className="w-full"
                      >
                        {confirmingAttendance ? 'Confirming...' : 'Confirm and Check In'}
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
