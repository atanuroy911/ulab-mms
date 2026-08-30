import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import CapstoneMarks from '@/models/CapstoneMarks';
import mongoose from 'mongoose';
import { escapeRegExp } from '@/lib/utils';

// GET - Fetch assigned students for current user in a specific course
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const courseCode = searchParams.get('courseCode');
    const role = searchParams.get('role'); // 'supervisor' or 'evaluator'

    await dbConnect();

    let query: any = {};

    // Filter by the course code (e.g., CSE4098A, CSE4098B, CSE4098C, CSE499)
    if (courseCode) {
      // Need to match using the course's code field
      const coursesMatch = await require('@/models/Course').default
        .find({ code: new RegExp(escapeRegExp(courseCode), 'i') })
        .select('_id');
      
      if (coursesMatch.length > 0) {
        query.courseId = { $in: coursesMatch.map((c: any) => c._id) };
      }
    }

    // Filter by role and user
    if (role === 'supervisor') {
      query.supervisorId = new mongoose.Types.ObjectId(session.user.id);
    } else if (role === 'evaluator') {
      query.evaluatorId = new mongoose.Types.ObjectId(session.user.id);
    } else {
      // Default: get all assignments for this user
      query.$or = [
        { supervisorId: new mongoose.Types.ObjectId(session.user.id) },
        { evaluatorId: new mongoose.Types.ObjectId(session.user.id) },
      ];
    }

    const assignments = await CapstoneMarks.find(query)
      .populate('studentId', 'name studentId')
      .populate('courseId', 'name code')
      .sort({ createdAt: -1 });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error('GET /api/capstone/assigned-students error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assigned students' },
      { status: 500 }
    );
  }
}
