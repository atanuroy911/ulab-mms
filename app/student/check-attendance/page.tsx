'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Loader2, Calendar } from 'lucide-react';

interface AttendanceStats {
  courseId: string;
  courseName: string;
  courseCode: string;
  totalSessions: number;
  attendedSessions: number;
  absentSessions: number;
  percentage: number;
  sessions: Array<{
    id: string;
    date: string;
    attended: boolean;
  }>;
}

export default function CheckAttendancePage() {
  const [studentId, setStudentId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<AttendanceStats | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setStats(null);

    try {
      const response = await fetch(`/api/student/attendance/${courseId}?studentId=${studentId}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch attendance');
      }

      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">Check My Attendance</h1>
          <p className="mt-2 text-gray-600">View your attendance record for any course</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Enter Your Details</CardTitle>
            <CardDescription>
              Enter your student ID and course ID to view your attendance statistics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="studentId">Student ID</Label>
                <Input
                  id="studentId"
                  type="text"
                  placeholder="e.g., 2021-1-60-001"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  required
                  className="text-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="courseId">Course ID</Label>
                <Input
                  id="courseId"
                  type="text"
                  placeholder="Enter course ID"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  required
                  className="text-lg"
                />
                <p className="text-sm text-gray-500">
                  Tip: You can find the course ID in the course URL or ask your instructor
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  'Check Attendance'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {stats && (
          <div className="space-y-6">
            <Card className="border-2 border-blue-200">
              <CardHeader>
                <CardTitle className="text-2xl">{stats.courseName}</CardTitle>
                <CardDescription className="text-base">{stats.courseCode}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                  <div className="rounded-lg bg-green-50 p-4 text-center">
                    <div className="text-3xl font-bold text-green-600">{stats.attendedSessions}</div>
                    <div className="text-sm text-gray-600">Present</div>
                  </div>
                  <div className="rounded-lg bg-red-50 p-4 text-center">
                    <div className="text-3xl font-bold text-red-600">{stats.absentSessions}</div>
                    <div className="text-sm text-gray-600">Absent</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4 text-center">
                    <div className="text-3xl font-bold text-gray-600">{stats.totalSessions}</div>
                    <div className="text-sm text-gray-600">Total Sessions</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-4 text-center">
                    <div className="text-3xl font-bold text-blue-600">{stats.percentage}%</div>
                    <div className="text-sm text-gray-600">Percentage</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Attendance Progress</span>
                    <span className="text-gray-600">{stats.attendedSessions} / {stats.totalSessions}</span>
                  </div>
                  <Progress value={stats.percentage} className="h-3" />
                </div>

                {stats.percentage < 75 && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      ⚠️ Your attendance is below 75%. You may need to attend more classes.
                    </AlertDescription>
                  </Alert>
                )}

                {stats.percentage >= 75 && stats.percentage < 90 && (
                  <Alert>
                    <AlertDescription>
                      ℹ️ Your attendance is acceptable. Try to maintain or improve it.
                    </AlertDescription>
                  </Alert>
                )}

                {stats.percentage >= 90 && (
                  <Alert className="border-green-200 bg-green-50">
                    <AlertDescription className="text-green-800">
                      ✓ Excellent attendance! Keep up the good work.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Session Details</CardTitle>
                <CardDescription>
                  Complete list of all attendance sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats.sessions.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    No attendance sessions recorded yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stats.sessions.map((session, index) => (
                      <div
                        key={session.id}
                        className={`flex items-center justify-between rounded-lg border p-3 ${
                          session.attended
                            ? 'border-green-200 bg-green-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {session.attended ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-gray-400" />
                          )}
                          <div>
                            <div className="font-medium">
                              Session {stats.sessions.length - index}
                            </div>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Calendar className="h-3 w-3" />
                              {new Date(session.date).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                        </div>
                        <div>
                          {session.attended ? (
                            <span className="text-sm font-medium text-green-600">Present</span>
                          ) : (
                            <span className="text-sm font-medium text-gray-400">Absent</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
