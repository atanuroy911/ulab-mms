import { NextResponse } from 'next/server';
import { currentStudent } from '@/lib/studentPortalAuth';

// Who the portal is showing: the signed-in student, or the student an admin is viewing as.
export async function GET() {
  const me = await currentStudent();
  if (!me) return NextResponse.json({ error: 'Sign in with your ULAB student Google account' }, { status: 401 });
  return NextResponse.json({
    studentId: me.studentIdText,
    name: me.name.replace(/\s*\([^)]*\)\s*$/, ''),
    viewAs: me.viewAs,
    viewedBy: me.viewedBy ?? null,
    canWrite: me.canWrite,
  });
}
