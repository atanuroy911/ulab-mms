import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getServerSession } from 'next-auth';
import { authOptions, isStudentOnlySessionUser } from '@/app/api/auth/[...nextauth]/route';

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET must be set - admin auth cannot fall back to a hardcoded secret');
}

export const ADMIN_JWT_SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
const SECRET = ADMIN_JWT_SECRET;

/** The shared admin-password session, and whether it was completed with an authenticator code. */
async function verifyAdminCookie(request: NextRequest): Promise<{ ok: boolean; mfa: boolean }> {
  try {
    const token = request.cookies.get('admin-token')?.value;
    if (!token) return { ok: false, mfa: false };

    const { payload } = await jwtVerify(token, SECRET);
    return { ok: payload.type === 'admin', mfa: payload.type === 'admin' && payload.mfa === true };
  } catch (error) {
    console.error('Error verifying admin token:', error);
    return { ok: false, mfa: false };
  }
}

export interface AdminAccess {
  ok: boolean;
  /** The signed-in User's id when access came from a role-based session; null for the
   *  shared admin-password cookie, which carries no user identity. */
  userId: string | null;
  /** Strongly authenticated: an admin-role account, or the shared login completed with an
   *  authenticator code. Privilege changes (granting roles) require this. */
  verified: boolean;
  /** 'role': a signed-in account with the admin role. 'shared': the shared admin password. */
  via: 'role' | 'shared' | null;
}

/**
 * Grants admin access via EITHER the legacy shared-password cookie (no identity) OR a
 * NextAuth session whose roles include 'admin' (has identity, for audit purposes). Purely
 * additive over the old cookie-only check - nothing that worked before stops working.
 */
export async function verifyAdminAccess(request: NextRequest): Promise<AdminAccess> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; roles?: string[] } | undefined;
  // Student-only tokens carry an OAuth id, not a User id - never treat them as a person here.
  const personId =
    sessionUser?.id && !isStudentOnlySessionUser(sessionUser) ? sessionUser.id : null;

  if (personId && sessionUser?.roles?.includes('admin')) {
    return { ok: true, userId: personId, verified: true, via: 'role' };
  }

  // The admin-panel cookie: if a teacher is also signed in in this browser, that person is
  // the one acting, so report them for audit; otherwise the caller records "Web Admin".
  const cookie = await verifyAdminCookie(request);
  if (cookie.ok) {
    return { ok: true, userId: personId, verified: cookie.mfa, via: 'shared' };
  }

  return { ok: false, userId: null, verified: false, via: null };
}

/**
 * @deprecated Prefer `verifyAdminAccess` for new code (it also returns the actor's identity
 * when available). Kept as a boolean-returning wrapper so the ~40 existing call sites that
 * only check "is this an admin request?" don't all need touching at once - they now also
 * accept a role-based session, not just the shared admin-password cookie.
 */
export async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  return (await verifyAdminAccess(request)).ok;
}
