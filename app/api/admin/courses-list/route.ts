import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import { verifyAdminToken } from '@/lib/adminAuth';

// GET all courses (admin panel use)
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();

    // Fetch all courses
    const courses = await Course.find({})
      .select('_id name code semester year section courseType')
      .sort({ code: 1 });

    return NextResponse.json({ courses }, { status: 200 });
  } catch (error: any) {
    console.error('Get courses list error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
