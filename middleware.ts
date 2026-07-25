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
  if (pathname === '/auth/signin' && token && !token.checkinOnly && !token.marksOnly && !token.projectOnly) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (pathname === '/admin/signin' && request.cookies.get('admin-token')) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  // Protect dashboard and course routes
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/course')) {
    // Tokens minted via the attendance check-in / check-marks / project check-in Google
    // providers are scoped to those flows only (see app/api/auth/[...nextauth]/route.ts) and
    // must never grant dashboard/course access, otherwise scanning an attendance QR code or
    // checking marks/project groups would auto-login into the full teacher app.
    if (!token || token.checkinOnly || token.marksOnly || token.projectOnly) {
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  // Protect admin routes - only admins can access (except signin page)
  if (pathname.startsWith('/admin') && pathname !== '/admin/signin') {
    // Admin routes use cookie-based auth, check for admin-token
    const adminToken = request.cookies.get('admin-token');
    if (!adminToken) {
      const adminSignInUrl = new URL('/admin/signin', request.url);
      return NextResponse.redirect(adminSignInUrl);
    }
  }

  // Student routes are now publicly accessible (no authentication required)

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/course/:path*', '/admin/:path*'],
};
