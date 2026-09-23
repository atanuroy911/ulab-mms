import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const { pathname } = request.nextUrl;

  // Redirect authenticated users away from sign-in pages
  if (pathname === '/auth/signin' && token && !token.checkinOnly && !token.marksOnly && !token.projectOnly && !token.studentSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (pathname === '/admin/signin' && request.cookies.get('admin-token')) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  // Protect dashboard and course routes
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/course')) {
    // Tokens minted via the attendance check-in / check-marks / project check-in / student
    // dashboard Google providers are scoped to those flows only (see
    // app/api/auth/[...nextauth]/route.ts) and must never grant dashboard/course access,
    // otherwise scanning an attendance QR code or checking marks/project groups would
    // auto-login into the full teacher app.
    if (!token || token.checkinOnly || token.marksOnly || token.projectOnly || token.studentSession) {
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  // Protect the student dashboard - requires the dedicated student login (google-student),
  // not the scoped checkin/marks/project tokens (which prove identity for one action only)
  // and not a teacher/admin session either.
  if (pathname.startsWith('/student/dashboard')) {
    if (!token || !token.studentSession) {
      const signInUrl = new URL('/student/signin', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  // Protect admin routes - only admins can access (except signin page). Accepts EITHER the
  // legacy shared admin-password cookie OR a NextAuth session whose roles include 'admin'
  // (see lib/adminAuth.ts's verifyAdminAccess, which the API routes behind this already
  // accept - this just makes the page-level gate agree with them).
  if (pathname.startsWith('/admin') && pathname !== '/admin/signin') {
    const hasAdminCookie = !!request.cookies.get('admin-token');
    const hasAdminRole = Array.isArray(token?.roles) && (token!.roles as string[]).includes('admin');
    if (!hasAdminCookie && !hasAdminRole) {
      const adminSignInUrl = new URL('/admin/signin', request.url);
      return NextResponse.redirect(adminSignInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/course/:path*', '/admin/:path*', '/student/dashboard/:path*'],
};
