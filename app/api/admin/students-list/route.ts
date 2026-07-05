import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Student from '@/models/Student';
import { verifyAdminToken } from '@/lib/adminAuth';

// GET all students (admin panel use)
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();

    // Fetch all students with basic info
    const students = await Student.find({})
      .select('_id name studentId courseId')
      .sort({ studentId: 1, _id: 1 })
      .collation({ locale: 'en', numericOrdering: true });

    return NextResponse.json(students, { status: 200 });
  } catch (error: any) {
    console.error('Get students list error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
