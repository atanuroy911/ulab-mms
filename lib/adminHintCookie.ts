import type { NextResponse } from 'next/server';

/**
 * A readable companion to the httpOnly `admin-token` cookie (the /admin panel login).
 *
 * The browser can't see `admin-token`, so without this every teacher page had to ask
 * /api/admin/verify whether one exists - a guaranteed 401 for everyone who isn't a web-admin.
 * This hint only says "an admin login was issued in this browser"; it grants nothing. The
 * server still verifies the real token on every request, so a forged hint just costs one
 * verify call that returns 401.
 */
export const ADMIN_HINT_COOKIE = 'admin-hint';

/** Mirrors admin-token's lifetime so the hint expires with the login it describes. */
export function setAdminHintCookie(response: NextResponse) {
  response.cookies.set(ADMIN_HINT_COOKIE, '1', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 30,
    path: '/',
  });
}
