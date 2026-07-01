import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceSession from '@/models/AttendanceSession';
import Course from '@/models/Course';
import Student from '@/models/Student';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import mongoose from 'mongoose';
import { buildAbsentFillRecords } from '@/lib/attendanceHelpers';

async function resolveParams(params: any) {
  const resolved = await params;
  return resolved.id as string;
}

type BulkAction = 'fillAbsent' | 'randomize' | 'reset';

export async function POST(req: NextRequest, { params }: { params: any }) {
  await dbConnect();

  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const courseId = await resolveParams(params);

  try {
    const course = await Course.findById(courseId);
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    if ((course.userId as any).toString() !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as BulkAction;

    if (!['fillAbsent', 'randomize', 'reset'].includes(action)) {
      return NextResponse.json({ error: 'action must be one of fillAbsent, randomize, reset' }, { status: 400 });
    }

    const [sessions, allStudents] = await Promise.all([
      AttendanceSession.find({ courseId: new mongoose.Types.ObjectId(courseId) }),
      Student.find({ courseId: new mongoose.Types.ObjectId(courseId) }).lean(),
    ]);

    const now = new Date();

    if (action === 'reset') {
      for (const targetSession of sessions) {
        targetSession.records = [] as any;
      }
    } else if (action === 'randomize') {
      for (const targetSession of sessions) {
        targetSession.records = allStudents.map((student) => ({
          studentId: student._id,
          status: Math.random() < 0.5 ? 'absent' : 'present',
          recordedAt: now,
          markedBy: 'manual',
          studentIdString: student.studentId,
        })) as any;
      }
    } else {
      for (const targetSession of sessions) {
        const fillRecords = buildAbsentFillRecords(targetSession.records, allStudents);
        targetSession.records.push(...(fillRecords as any));
      }
    }

    await Promise.all(sessions.map((targetSession) => targetSession.save()));

    return NextResponse.json({ sessionsAffected: sessions.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error running bulk attendance action' }, { status: 500 });
  }
}
