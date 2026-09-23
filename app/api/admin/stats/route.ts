import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import User from '@/models/User';
import Semester from '@/models/Semester';
import Department from '@/models/Department';
import { verifyAdminAccess } from '@/lib/adminAuth';

// GET /api/admin/stats
// Returns counts only — far cheaper than fetching full document arrays.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdminAccess(request);
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const [courses, accounts, semesters, departments] = await Promise.all([
      Course.countDocuments(),
      User.countDocuments(),
      Semester.countDocuments(),
      Department.countDocuments(),
    ]);

    return NextResponse.json({ courses, accounts, semesters, departments });
  } catch (error) {
    console.error('GET /api/admin/stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
