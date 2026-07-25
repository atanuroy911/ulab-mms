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

function getUtcDateKey(value: Date) {
  return value.toISOString().split('T')[0];
}

export async function GET(_req: NextRequest, { params }: { params: any }) {
  await dbConnect();

  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const courseId = await resolveParams(params);

  const course = await Course.findById(courseId);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  if ((course.userId as any).toString() !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const [sessions, activeSession] = await Promise.all([
      AttendanceSession.find({ courseId: new mongoose.Types.ObjectId(courseId) }).sort({ date: -1 }).lean(),
      AttendanceSession.findOne({ courseId: new mongoose.Types.ObjectId(courseId), open: true }).lean(),
    ]);

    return NextResponse.json({ sessions, activeSession: activeSession || null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error fetching attendance sessions' }, { status: 500 });
  }
}

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
    const selectedDate = typeof body?.date === 'string' ? body.date : '';

    const activeSession = await AttendanceSession.findOne({ courseId: new mongoose.Types.ObjectId(courseId), open: true });

    if (activeSession) {
      // Closing a session: anyone not already marked present/absent is now absent.
      const allStudents = await Student.find({ courseId: new mongoose.Types.ObjectId(courseId) }).lean();
      const fillRecords = buildAbsentFillRecords(activeSession.records, allStudents);
      activeSession.records.push(...(fillRecords as any));

      activeSession.open = false;
      await activeSession.save();
      return NextResponse.json({ session: activeSession, action: 'closed' });
    }

    const sessionDate = selectedDate ? new Date(selectedDate) : new Date();

    if (Number.isNaN(sessionDate.getTime())) {
      return NextResponse.json({ error: 'Invalid session date' }, { status: 400 });
    }

    const sessionDateKey = getUtcDateKey(sessionDate);
    const startOfDay = new Date(`${sessionDateKey}T00:00:00.000Z`);
    const endOfDay = new Date(`${sessionDateKey}T23:59:59.999Z`);
    const existingSameDaySession = await AttendanceSession.findOne({
      courseId: new mongoose.Types.ObjectId(courseId),
      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    if (existingSameDaySession) {
      return NextResponse.json(
        { error: 'Duplicate session date. Select a different date.' },
        { status: 409 }
      );
    }

    const sessionDoc = await AttendanceSession.create({
      courseId: new mongoose.Types.ObjectId(courseId),
      startedBy: new mongoose.Types.ObjectId(session.user.id),
      date: sessionDate,
      open: true,
      sessionCode: `${courseId}-${sessionDateKey}`,
      records: [],
    });

    return NextResponse.json({ session: sessionDoc, action: 'opened' });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error toggling attendance session' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: any }) {
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

    const body = await req.json();
    const { sessionId, studentId, studentIds, status, applyToAll } = body as {
      sessionId?: string;
      studentId?: string;
      studentIds?: string[];
      status?: 'present' | 'absent';
      applyToAll?: boolean;
    };

    if (!sessionId || !status || !['present', 'absent'].includes(status)) {
      return NextResponse.json({ error: 'sessionId and a valid status (present/absent) are required' }, { status: 400 });
    }

    if (!applyToAll && !studentId && !(Array.isArray(studentIds) && studentIds.length > 0)) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }

    const targetSession = await AttendanceSession.findOne({
      _id: sessionId,
      courseId: new mongoose.Types.ObjectId(courseId),
    });

    if (!targetSession) {
      return NextResponse.json({ error: 'Attendance session not found' }, { status: 404 });
    }

    if (Array.isArray(studentIds) && studentIds.length > 0) {
      const matchedStudents = await Student.find({
        _id: { $in: studentIds },
        courseId: new mongoose.Types.ObjectId(courseId),
      }).lean();

      const now = new Date();
      const recordByStudentId = new Map(
        targetSession.records.map((record) => [String(record.studentId), record])
      );

      for (const student of matchedStudents) {
        const record = {
          studentId: student._id,
          status,
          recordedAt: now,
          markedBy: 'auto' as const,
          studentIdString: student.studentId,
        };
        recordByStudentId.set(String(student._id), record as any);
      }

      targetSession.records = Array.from(recordByStudentId.values()) as any;
      await targetSession.save();
      return NextResponse.json({ session: targetSession, matchedCount: matchedStudents.length });
    }

    if (applyToAll) {
      const allStudents = await Student.find({ courseId: new mongoose.Types.ObjectId(courseId) }).lean();
      const now = new Date();
      targetSession.records = allStudents.map((student) => ({
        studentId: student._id,
        status,
        recordedAt: now,
        markedBy: 'manual',
        studentIdString: student.studentId,
      })) as any;

      await targetSession.save();
      return NextResponse.json({ session: targetSession });
    }

    const student = await Student.findOne({ _id: studentId, courseId: new mongoose.Types.ObjectId(courseId) });
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const existingIndex = targetSession.records.findIndex((record) => String(record.studentId) === String(student._id));
    const record = {
      studentId: student._id,
      status,
      recordedAt: new Date(),
      markedBy: 'manual' as const,
      studentIdString: student.studentId,
    };

    if (existingIndex >= 0) {
      targetSession.records[existingIndex] = record as any;
    } else {
      targetSession.records.push(record as any);
    }

    await targetSession.save();
    return NextResponse.json({ session: targetSession });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error updating attendance record' }, { status: 500 });
  }
}
