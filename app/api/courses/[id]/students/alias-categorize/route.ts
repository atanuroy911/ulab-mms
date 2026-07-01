import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAliasBatchCandidate } from '@/lib/studentAlias';

async function resolveCourseForRequest(courseId: string, userId: string) {
  const course = await Course.findOne({ _id: courseId, userId });
  return course;
}

// GET: preview which students would be newly flagged for the alias group.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: courseId } = await params;
    await dbConnect();

    const course = await resolveCourseForRequest(courseId, session.user.id);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const students = await Student.find({ courseId, useAlias: { $ne: true } })
      .select('studentId name')
      .sort({ studentId: 1 })
      .lean();

    const candidates = students.filter((s) => isAliasBatchCandidate(s.studentId));

    return NextResponse.json({
      candidates: candidates.map((s) => ({ _id: String(s._id), studentId: s.studentId, name: s.name })),
    });
  } catch (error) {
    console.error('Alias-categorize preview error:', error);
    return NextResponse.json({ error: 'Failed to preview alias candidates' }, { status: 500 });
  }
}

// POST: apply - flags every currently-matching student as useAlias = true.
// Only ever adds students to the alias group; never removes an existing flag,
// so manual overrides the teacher already made are preserved.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: courseId } = await params;
    await dbConnect();

    const course = await resolveCourseForRequest(courseId, session.user.id);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const students = await Student.find({ courseId, useAlias: { $ne: true } }).select('_id studentId');
    const idsToFlag = students.filter((s) => isAliasBatchCandidate(s.studentId)).map((s) => s._id);

    if (idsToFlag.length > 0) {
      await Student.updateMany({ _id: { $in: idsToFlag } }, { useAlias: true });
    }

    return NextResponse.json({ updated: idsToFlag.length });
  } catch (error) {
    console.error('Alias-categorize apply error:', error);
    return NextResponse.json({ error: 'Failed to auto-categorize students' }, { status: 500 });
  }
}
