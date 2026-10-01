import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import StudentAccount from '@/models/StudentAccount';
import Student from '@/models/Student';
import User from '@/models/User';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { actAsAllowed, clearViewAsCookie, setViewAsCookie } from '@/lib/studentViewAs';

// POST { studentId, write? }: view the student portal as this student - read only for 30 minutes,
// or acting with write access for 10 (only while the Developer setting "Act as students" is on).
// DELETE: stop. Admins only, strongly authenticated: an admin-role account, or the shared
// admin login completed with its authenticator code.

export async function POST(request: NextRequest) {
  const access = await verifyAdminAccess(request);
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
  if (!access.verified) {
    return NextResponse.json(
      { error: 'Viewing as a student needs a verified admin: sign in with your admin account, or the shared admin login with its authenticator code.' },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const studentId = typeof body?.studentId === 'string' ? body.studentId.trim() : '';
  if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
  const write = body?.write === true;
  if (write && !(await actAsAllowed())) {
    return NextResponse.json({ error: 'Acting as a student is off. Turn on "Act as students" in Developer settings first.' }, { status: 403 });
  }

  await dbConnect();
  const [account, roster] = await Promise.all([
    StudentAccount.findOne({ studentId }).select('studentId name').lean(),
    Student.findOne({ studentId }).select('studentId name').lean(),
  ]);
  const found = account || roster;
  if (!found) return NextResponse.json({ error: `No student with ID ${studentId}` }, { status: 404 });

  const by =
    access.via === 'role' && access.userId
      ? ((await User.findById(access.userId).select('name').lean<{ name?: string }>())?.name || 'admin')
      : 'shared admin login';
  console.warn(`[view-as] ${by} started ${write ? 'ACTING (write access)' : 'viewing'} as student ${studentId}`);

  const response = NextResponse.json({ ok: true, studentId: found.studentId, name: found.name, href: '/student/dashboard' });
  await setViewAsCookie(response, { studentId: found.studentId, name: found.name, by, write });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearViewAsCookie(response);
  return response;
}
