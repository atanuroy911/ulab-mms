import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAdminToken } from '@/lib/adminAuth';

// GET all users for dropdown selection (supervisors, evaluators)
export async function GET(request: NextRequest) {
  try {
    // Only used by the admin dashboard (capstone supervisor/evaluator pickers) - restricted to
    // admins, not just any signed-in teacher, since it lists every user's name/email.
    const session = await getServerSession(authOptions);
    const isAdmin = (session?.user as any)?.role === 'admin' || (await verifyAdminToken(request));
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    // Fetch all users with basic info needed for supervisor/evaluator selection
    const users = await User.find({}, 'name email _id')
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
