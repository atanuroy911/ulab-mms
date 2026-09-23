import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const access = await verifyAdminAccess(request);
    // Real status code now (previously always 200 regardless of auth result, so the
    // client's `if (response.ok)` check was a no-op - see app/admin/dashboard/page.tsx).
    return NextResponse.json(
      { authenticated: access.ok, userId: access.userId },
      { status: access.ok ? 200 : 401 }
    );
  } catch (error: any) {
    console.error('Admin verify error:', error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
