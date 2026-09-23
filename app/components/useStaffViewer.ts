'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export type StaffViewer =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'teacher'; roles: string[]; coordinatorDepartments: string[] }
  /** The /admin panel's built-in login alone - management rights everywhere, but not a person. */
  | { status: 'webAdmin'; roles: string[]; coordinatorDepartments: string[] };

/**
 * Who is looking at a staff page: a signed-in teacher account (any role), the /admin panel's
 * web-admin login, or nobody. Mirrors getCapstoneActor() in lib/capstoneAuth.ts:
 *  - a teacher who also holds the /admin panel login is still that teacher, with 'admin' added;
 *  - the /admin panel login on its own is the web-admin.
 * Capstone pages gate on this rather than on the NextAuth session alone.
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
    fetch('/api/admin/verify')
      .then((res) => !cancelled && setAdminLogin(res.ok))
      .catch(() => !cancelled && setAdminLogin(false));
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
