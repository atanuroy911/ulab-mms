import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceSession from '@/models/AttendanceSession';
import Course from '@/models/Course';
import Student from '@/models/Student';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import mongoose from 'mongoose';

async function resolveParams(params: any) {
  const resolved = await params;
  return resolved.id as string;
}

function getUtcDateKey(value: Date) {
  return value.toISOString().split('T')[0];
}

interface ImportRecord {
  studentId?: string;
  status?: 'present' | 'absent';
}

interface ImportSession {
  date?: string;
  records?: ImportRecord[];
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

    const body = await req.json().catch(() => null);
    const incomingSessions: ImportSession[] = Array.isArray(body?.sessions) ? body.sessions : [];
    const sourceCourseId = typeof body?.courseId === 'string' ? body.courseId : null;
    const force = body?.force === true;

    if (incomingSessions.length === 0) {
      return NextResponse.json({ error: 'No sessions found in the import file' }, { status: 400 });
    }

    // Same students are often enrolled in multiple courses/sections, so a roll-number
    // match alone isn't enough to guarantee this file belongs here. Require the
    // caller to explicitly confirm before importing a file from a different course.
    if (sourceCourseId && sourceCourseId !== courseId && !force) {
      return NextResponse.json(
        {
          error: 'This file was exported from a different course. Confirm to import it here anyway.',
          mismatchedCourse: true,
          sourceCourseId,
          sourceCourseName: typeof body?.courseName === 'string' ? body.courseName : null,
        },
        { status: 409 }
      );
    }

    const allStudents = await Student.find({ courseId: new mongoose.Types.ObjectId(courseId) }).lean();
    const studentByRoll = new Map(allStudents.map((student) => [student.studentId, student]));

    let sessionsCreated = 0;
    let sessionsUpdated = 0;
    let recordsMatched = 0;
    let recordsSkipped = 0;
    let sessionsSkipped = 0;

    for (const incoming of incomingSessions) {
      const parsedDate = incoming?.date ? new Date(incoming.date) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        sessionsSkipped += 1;
        continue;
      }

      const dateKey = getUtcDateKey(parsedDate);
      const startOfDay = new Date(`${dateKey}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateKey}T23:59:59.999Z`);

      const records = [];
      for (const rec of Array.isArray(incoming?.records) ? incoming.records : []) {
        const student = rec?.studentId ? studentByRoll.get(String(rec.studentId).trim()) : undefined;
        if (!student || (rec?.status !== 'present' && rec?.status !== 'absent')) {
          recordsSkipped += 1;
          continue;
        }
        records.push({
          studentId: student._id,
          status: rec.status,
          recordedAt: new Date(),
          markedBy: 'manual',
          studentIdString: student.studentId,
        });
        recordsMatched += 1;
      }

      const targetSession = await AttendanceSession.findOne({
        courseId: new mongoose.Types.ObjectId(courseId),
        date: { $gte: startOfDay, $lte: endOfDay },
      });

      if (targetSession) {
        targetSession.records = records as any;
        await targetSession.save();
        sessionsUpdated += 1;
      } else {
        await AttendanceSession.create({
          courseId: new mongoose.Types.ObjectId(courseId),
          startedBy: new mongoose.Types.ObjectId(session.user.id),
          date: parsedDate,
          open: false,
          sessionCode: `${courseId}-${dateKey}-import-${Date.now()}-${sessionsCreated}`,
          records,
        });
        sessionsCreated += 1;
      }
    }

    return NextResponse.json({ sessionsCreated, sessionsUpdated, sessionsSkipped, recordsMatched, recordsSkipped });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error importing attendance' }, { status: 500 });
  }
}
