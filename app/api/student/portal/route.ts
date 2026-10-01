import { NextResponse } from 'next/server';
import { courseSummaries, enrolments } from '@/lib/studentPortal';
import { portalStudent } from '@/lib/studentPortalAuth';

// The student portal's course list - read only. Who the student is comes from their own
// student sign-in (the ID in their Google name), never from the request.
export async function GET() {
  try {
    const me = await portalStudent();
    if (!me) return NextResponse.json({ error: 'Sign in with your ULAB student Google account' }, { status: 401 });
    const records = await enrolments(me.studentIdText);
    const courses = await courseSummaries(records);
    return NextResponse.json({
      student: { studentId: me.studentIdText, name: records[0]?.name || me.name },
      courses,
    });
  } catch (error) {
    console.error('GET /api/student/portal error:', error);
    return NextResponse.json({ error: 'Failed to load your courses' }, { status: 500 });
  }
}
