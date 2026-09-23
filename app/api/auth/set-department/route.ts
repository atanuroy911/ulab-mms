import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, isStudentOnlySessionUser } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Department from '@/models/Department';

// Self-service: a signed-in teacher sets their own department once, at onboarding
// (app/dashboard/page.tsx blocks on this being unset). Does not let a teacher change an
// admin-assigned department afterward - re-assignment is an admin action via
// PUT /api/admin/accounts/[id].
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // A student-scoped token also carries `session.user.id` (the Google OAuth sub, not a
    // Mongo User _id) - without this check, User.findById below would CastError on it.
    if (!session?.user?.id || isStudentOnlySessionUser(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const departmentId = typeof body?.departmentId === 'string' ? body.departmentId : '';
    if (!departmentId) {
      return NextResponse.json({ error: 'departmentId is required' }, { status: 400 });
    }

    await dbConnect();

    const department = await Department.findOne({ _id: departmentId, isActive: true });
    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (user.departmentId) {
      return NextResponse.json({ error: 'Department is already set - ask an admin to change it' }, { status: 409 });
    }

    user.departmentId = department._id as any;
    await user.save();

    return NextResponse.json({ departmentId: String(department._id) });
  } catch (error) {
    console.error('Set department error:', error);
    return NextResponse.json({ error: 'Failed to set department' }, { status: 500 });
  }
}
