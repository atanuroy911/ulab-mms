import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { verifyAdminAccess } from '@/lib/adminAuth';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';

// "View as student": an admin sees the student portal exactly as one student does, without
// their sign-in - read only. Two things must both hold on every request:
//   1. a short-lived signed cookie naming the student (and who started it), and
//   2. the requester is still a strongly authenticated admin (an admin-role account, or the
//      shared admin login completed with its authenticator code).
// The cookie alone is useless to anyone else. Every student write refuses while viewing - unless
// the admin chose to *act* as the student (write: true), which the Developer setting "Act as
// students" must allow, lasts 10 minutes, and logs every change with who really made it.

export const VIEW_AS_COOKIE = 'student-view-as';
const MINUTES = 30;
const WRITE_MINUTES = 10;
const secret = () => new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

export interface ViewAs {
  studentId: string;
  name: string;
  /** Who is viewing, for the banner and the log. */
  by: string;
  /** Acting as the student: their actions are allowed and saved as theirs. */
  write: boolean;
}

export async function setViewAsCookie(response: NextResponse, v: ViewAs) {
  const minutes = v.write ? WRITE_MINUTES : MINUTES;
  const token = await new SignJWT({ type: 'student-view-as', ...v }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(`${minutes}m`).setIssuedAt().sign(secret());
  response.cookies.set(VIEW_AS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: minutes * 60,
    path: '/',
  });
}

export function clearViewAsCookie(response: NextResponse) {
  response.cookies.set(VIEW_AS_COOKIE, '', { maxAge: 0, path: '/' });
}

/** The cookie's contents if its signature and expiry check out (no admin check - see viewAsStudent). */
export async function readViewAsToken(token: string | undefined | null): Promise<ViewAs | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.type !== 'student-view-as' || typeof payload.studentId !== 'string') return null;
    return { studentId: payload.studentId, name: String(payload.name || payload.studentId), by: String(payload.by || 'admin'), write: payload.write === true };
  } catch {
    return null;
  }
}

/** The student being viewed, if this request is a strongly authenticated admin viewing one. */
export async function viewAsStudent(): Promise<ViewAs | null> {
  const store = await cookies();
  const v = await readViewAsToken(store.get(VIEW_AS_COOKIE)?.value);
  if (!v) return null;
  // verifyAdminAccess only reads cookies from the request.
  const access = await verifyAdminAccess({ cookies: store } as unknown as NextRequest);
  if (!access.ok || !access.verified) return null;
  // Write access ends the moment the Developer setting is turned off.
  if (v.write && !(await actAsAllowed())) return { ...v, write: false };
  return v;
}

/** The Developer setting that allows acting as a student with write access. */
export async function actAsAllowed(): Promise<boolean> {
  await dbConnect();
  const s = await AdminSettings.findOne().select('devAllowActAsStudent').lean<{ devAllowActAsStudent?: boolean }>();
  return s?.devAllowActAsStudent === true;
}
