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
  const [active, setActive] = useState(false);
  const isAdminUser =
    canManage ?? ((session?.user as { roles?: string[] } | undefined)?.roles || []).includes('admin');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setActive(data?.devAllowAnyEmailDomain === true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!active) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-black">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        Developer mode: the @ulab.edu.bd email restriction is lifted.
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
