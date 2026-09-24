'use client';
import { signInStudentWithGoogle } from '@/lib/studentGoogleSignIn';

import { useState, Suspense, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Chrome, Loader2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { AuthShell } from '@/app/auth/components/AuthShell';

/**
 * The student portal's sign-in. Built on the same AuthShell as /auth/signin and the landing
 * page so all three surfaces share one layout, with the purple variant marking it as the
 * student side rather than faculty.
 */

const STUDENT_FEATURES = [
  'View attendance records across all your enrolled courses',
  'Check your exam and assignment marks in real time',
  'Submit weekly capstone journal entries and track your project',
];

function StudentSignInContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signingIn, setSigningIn] = useState(false);
  const callbackUrl = searchParams.get('callbackUrl') || '/student/dashboard';

  useEffect(() => {
    if (status === 'authenticated' && (session?.user as { studentSession?: boolean })?.studentSession) {
      router.push(callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  const handleSignIn = async () => {
    setSigningIn(true);
    await signInStudentWithGoogle('google-student', callbackUrl);
  };

  return (
    <AuthShell
      variant="purple"
      eyebrow="Student Portal"
      title={
        <>
          Your marks,
          <br />
          in one place.
        </>
      }
      tagline="Attendance, grades, and capstone progress — for ULAB students."
      features={STUDENT_FEATURES}
    >
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Logo — the brand panel covers this from lg up. */}
        <div className="flex justify-center lg:hidden">
          <Image src="/ulab.svg" alt="ULAB Logo" width={90} height={90} priority />
        </div>

        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-2 ring-emerald-500/20">
            <GraduationCap className="h-8 w-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Student Portal</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your <strong>ULAB Google account</strong> to access your academic records.
          </p>
        </div>

        <Button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          size="lg"
          className="w-full gap-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md transition-all hover:from-emerald-500 hover:to-teal-500 hover:shadow-lg"
        >
          {signingIn ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Redirecting to Google…
            </>
          ) : (
            <>
              <Chrome className="h-5 w-5" />
              Sign in with Google
            </>
          )}
        </Button>

        {/* The display-name requirement is how the app maps a Google account to a student
            record, so it belongs on the sign-in screen rather than in an error afterwards. */}
        <div className="space-y-1 rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
          <p>
            Your Google account&apos;s display name must include your{' '}
            <strong>student ID in parentheses</strong>.
          </p>
          <p className="font-mono text-foreground/60">e.g. &ldquo;John Doe (2021-1-60-123)&rdquo;</p>
        </div>

        <div className="space-y-4">
          <p className="text-center text-xs text-muted-foreground">
            Are you faculty or staff?{' '}
            <Link href="/auth/signin" className="font-medium text-primary hover:underline">
              Sign in here
            </Link>
          </p>

          <div className="space-y-0.5 text-center text-[11px] text-muted-foreground/70 lg:hidden">
            <p>University of Liberal Arts Bangladesh</p>
            <p>Marks Management System</p>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}

export default function StudentSignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <StudentSignInContent />
    </Suspense>
  );
}
