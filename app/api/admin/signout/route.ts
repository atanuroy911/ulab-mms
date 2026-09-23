import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_HINT_COOKIE } from '@/lib/adminHintCookie';

export async function POST(request: NextRequest) {
  const response = NextResponse.json(
    { success: true, message: 'Signed out successfully' },
    { status: 200 }
  );

  // Clear admin token cookie
  response.cookies.delete('admin-token');
  response.cookies.delete(ADMIN_HINT_COOKIE);

  return response;
}
