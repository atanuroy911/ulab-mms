import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAdminToken } from '@/lib/adminAuth';
import { PEOPLE_ONLY } from '@/lib/webAdminAccount';

// GET all users for dropdown selection (supervisors, evaluators)
export async function GET(request: NextRequest) {
  try {
    // Used by the admin dashboard and by coordinators picking capstone supervisors/
    // evaluators - restricted to admins/coordinators, not just any signed-in teacher, since
    // it lists every user's name/email.
    const session = await getServerSession(authOptions);
    const roles = (session?.user as any)?.roles as string[] | undefined;
    const isAuthorized =
      (session?.user as any)?.role === 'admin' ||
      roles?.includes('admin') ||
      roles?.includes('coordinator') ||
      (await verifyAdminToken(request));
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    // Fetch all users with basic info needed for supervisor/evaluator selection
    // invitePending lets pickers label people who haven't activated their invite yet.
    const users = await User.find(PEOPLE_ONLY, 'name email _id invitePending')
      .sort({ name: 1 });

    return NextResponse.json(users, { status: 200 });
  } catch (error: any) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
