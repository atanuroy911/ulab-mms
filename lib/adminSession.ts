import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { ADMIN_JWT_SECRET as SECRET } from '@/lib/adminAuth';
import { setAdminHintCookie } from '@/lib/adminHintCookie';

// The shared admin login's cookies. `admin-token` is the session (30 min); `mfa` says it
// was completed with an authenticator code, which privilege changes require. `admin-2fa`
// is the 5-minute gap between a correct password and the code.

const PENDING_COOKIE = 'admin-2fa';
const secure = process.env.NODE_ENV === 'production';

export async function setAdminSession(response: NextResponse, opts: { mfa: boolean }) {
  const token = await new SignJWT({ username: 'admin', role: 'admin', type: 'admin', mfa: opts.mfa })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30m')
    .setIssuedAt()
    .sign(SECRET);
  response.cookies.set('admin-token', token, { httpOnly: true, secure, sameSite: 'lax', maxAge: 60 * 30, path: '/' });
  response.cookies.set(PENDING_COOKIE, '', { maxAge: 0, path: '/api/admin' });
  setAdminHintCookie(response);
}

/** The password was right; the code is still owed. */
export async function setPendingSecondFactor(response: NextResponse) {
  const token = await new SignJWT({ type: 'admin-2fa' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').setIssuedAt().sign(SECRET);
  response.cookies.set(PENDING_COOKIE, token, { httpOnly: true, secure, sameSite: 'strict', maxAge: 60 * 5, path: '/api/admin' });
}

export async function hasPendingSecondFactor(request: NextRequest): Promise<boolean> {
  try {
    const token = request.cookies.get(PENDING_COOKIE)?.value;
    if (!token) return false;
    const { payload } = await jwtVerify(token, SECRET);
    return payload.type === 'admin-2fa';
  } catch {
    return false;
  }
}
