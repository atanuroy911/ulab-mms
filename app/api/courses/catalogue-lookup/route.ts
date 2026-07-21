import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { findFixedCourseByCode } from '@/lib/catalogueRegistry';

// Any signed-in teacher can look up a course code against the fixed
// PDF-transcribed registry -- used to suggest a New/UNESCO Code when the
// admin catalogue doesn't have one yet for a selected course.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions as any);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    const match = findFixedCourseByCode(code);
    return NextResponse.json({ unescoCode: match?.course.unescoCode || '' });
  } catch (error: any) {
    console.error('Catalogue lookup error:', error);
    return NextResponse.json({ unescoCode: '' });
  }
}
