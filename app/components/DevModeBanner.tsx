'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AlertTriangle } from 'lucide-react';

/**
 * Warns that a developer setting is loosening a production safeguard. Shown on every teacher
 * page while it's on, so the setting can't be left enabled and forgotten.
 */
export function DevModeBanner({
  manageHref = '/dashboard/developer',
  canManage,
}: {
  /** Where "Turn it off" points - the teacher page by default, the admin tab in /admin. */
  manageHref?: string;
  /** Forces the link on (the /admin panel login has no role-bearing session to check). */
  canManage?: boolean;
} = {}) {
  const { data: session } = useSession();
  const [anyDomain, setAnyDomain] = useState(false);
  const [studentTests, setStudentTests] = useState(false);
  const isAdminUser =
    canManage ?? ((session?.user as { roles?: string[] } | undefined)?.roles || []).includes('admin');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setAnyDomain(data?.devAllowAnyEmailDomain === true);
        setStudentTests(data?.devStudentTestSignIn === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!anyDomain && !studentTests) return null;
  const message = [
    anyDomain && 'the @ulab.edu.bd restriction is lifted for teachers',
    studentTests && 'outside test accounts can use the student sign-ins',
  ]
    .filter(Boolean)
    .join('; ');
  return (
    // pl-16 on phones keeps the text clear of the sidebar's fixed menu button (top-left).
    <div className="flex items-center justify-center gap-2 bg-amber-500 py-1.5 pl-16 pr-3 text-center text-xs font-medium text-black md:pl-4 md:pr-4">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">
        <span className="sm:hidden">Developer mode is on.</span>
        <span className="hidden sm:inline">Developer mode: {message}.</span>
        {isAdminUser && (
          <>
            {' '}
            <Link href={manageHref} className="underline">Turn it off</Link>
          </>
        )}
      </span>
    </div>
  );
}
