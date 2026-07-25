'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Chrome, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AuthGateProps {
  onAdminOverride: (studentId: string, courseId: string, adminPassword: string) => Promise<void> | void;
  loading: boolean;
  error: string;
}

export function AuthGate({ onAdminOverride, loading, error }: AuthGateProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    await signIn('google-checkin', { callbackUrl: window.location.href });
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAdminOverride(studentId, courseId, adminPassword);
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Chrome className="h-5 w-5 text-primary" />
          Sign in to Check Your Attendance
        </CardTitle>
        <CardDescription>
          Sign in with your ULAB Google account so we can confirm it&apos;s really you before showing your attendance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" onClick={handleGoogleSignIn} disabled={signingIn} className="w-full sm:w-auto">
          {signingIn ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting to Google...
            </>
          ) : (
            <>
              <Chrome className="h-4 w-4" />
              Sign in with Google
            </>
          )}
        </Button>

        <div>
          <button
            type="button"
            onClick={() => setShowOverride((v) => !v)}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Teacher or admin? Check with admin password instead
          </button>
        </div>

        {showOverride && (
          <form onSubmit={handleOverrideSubmit} className="space-y-3 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Admin Override
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-student-id">Student ID</Label>
              <Input
                id="override-student-id"
                type="text"
                placeholder="e.g., 2021-1-60-001"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-course-id">Course ID</Label>
              <Input
                id="override-course-id"
                type="text"
                placeholder="Enter course ID"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-admin-password">Admin Password</Label>
              <Input
                id="override-admin-password"
                type="password"
                placeholder="Admin password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                'Check Attendance'
              )}
            </Button>
          </form>
        )}

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
