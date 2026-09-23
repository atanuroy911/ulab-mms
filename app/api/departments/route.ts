import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Department from '@/models/Department';

// Requires a signed-in session (any authenticated user - teacher or student, for onboarding
// pickers) but no particular role; department names/codes aren't secret among signed-in
// users, but this must not be reachable anonymously, and it must not perform a write (seeding
// now happens once via the migration runner, not on every GET - see lib/migrations/).
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const departments = await Department.find({ isActive: true })
      .select('code name shortCode icon')
      .sort({ name: 1 });

    return NextResponse.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
  }
}
