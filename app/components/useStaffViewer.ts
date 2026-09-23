'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export type StaffViewer =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'teacher'; roles: string[]; coordinatorDepartments: string[] }
  /** The /admin panel's built-in login alone - management rights everywhere, but not a person. */
  | { status: 'webAdmin'; roles: string[]; coordinatorDepartments: string[] };

/** Set alongside the httpOnly admin-token at /admin sign-in (lib/adminHintCookie.ts). */
function hasAdminHint(): boolean {
  return typeof document !== 'undefined' && /(?:^|;\s*)admin-hint=/.test(document.cookie);
}

// One /api/admin/verify per page load, shared by every component using this hook (the shell,
// the page, dialogs), instead of one request each. Reused for a minute, then re-checked.
let verifyCache: { at: number; promise: Promise<boolean> } | null = null;
function verifyAdminLogin(): Promise<boolean> {
  if (verifyCache && Date.now() - verifyCache.at < 60_000) return verifyCache.promise;
  const promise = fetch('/api/admin/verify')
    .then((res) => res.ok)
    .catch(() => false);
  verifyCache = { at: Date.now(), promise };
  return promise;
}

/**
 * Who is looking at a staff page: a signed-in teacher account (any role), the /admin panel's
 * web-admin login, or nobody. Mirrors getCapstoneActor() in lib/capstoneAuth.ts:
 *  - a teacher who also holds the /admin panel login is still that teacher, with 'admin' added;
 *  - the /admin panel login on its own is the web-admin.
 * Capstone pages gate on this rather than on the NextAuth session alone.
 *
 * The admin login is only checked when the browser carries the admin-hint cookie, so ordinary
 * teachers never call /api/admin/verify (which would always answer 401 for them).
 */
export function useStaffViewer(): StaffViewer {
  const { data: session, status } = useSession();
  const [adminLogin, setAdminLogin] = useState<boolean | null>(null);

  const user = session?.user as { roles?: string[]; coordinatorDepartments?: string[] } | undefined;
  const sessionRoles = user?.roles || [];
  // Only ask the server when it could change the answer: nobody signed in, or a signed-in
  // teacher without the admin role who might also hold the /admin panel login.
  const needsCheck = status === 'unauthenticated' || (status === 'authenticated' && !sessionRoles.includes('admin'));

  useEffect(() => {
    if (!needsCheck) return;
    let cancelled = false;
    // No hint means no admin login was issued in this browser - answer without a request.
    const check = hasAdminHint() ? verifyAdminLogin() : Promise.resolve(false);
    check.then((ok) => !cancelled && setAdminLogin(ok));
    return () => {
      cancelled = true;
    };
  }, [needsCheck]);

  if (status === 'loading') return { status: 'loading' };
  if (status === 'authenticated') {
    const roles = adminLogin && !sessionRoles.includes('admin') ? [...sessionRoles, 'admin'] : sessionRoles;
    return { status: 'teacher', roles, coordinatorDepartments: user?.coordinatorDepartments || [] };
  }
  if (adminLogin === null) return { status: 'loading' };
  return adminLogin ? { status: 'webAdmin', roles: ['admin'], coordinatorDepartments: [] } : { status: 'none' };
}
