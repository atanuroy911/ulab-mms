import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceSession from '@/models/AttendanceSession';
import Student from '@/models/Student';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import mongoose from 'mongoose';

export async function POST(req: NextRequest) {
  await dbConnect();

  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email.toLowerCase();
  if (!email.endsWith('@ulab.edu.bd')) {
    return NextResponse.json({ error: 'Email must be @ulab.edu.bd' }, { status: 403 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const courseId = body?.courseId as string;
  const confirmedStudentId = body?.confirmedStudentId as string | undefined;
  const sessionDateISO = typeof body?.sessionDateISO === 'string' ? body.sessionDateISO : '';
  if (!courseId) {
    return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
  }

  try {
    const activeSession = await AttendanceSession.findOne({
      courseId: new mongoose.Types.ObjectId(courseId),
      open: true,
    });

    if (!activeSession) {
      return NextResponse.json({ error: 'No active attendance session' }, { status: 400 });
    }

    const parsedSessionDate = sessionDateISO ? new Date(sessionDateISO) : null;
    if (!parsedSessionDate || Number.isNaN(parsedSessionDate.getTime())) {
      return NextResponse.json({ error: 'Invalid session date' }, { status: 400 });
    }

    const activeSessionDateISO = new Date(activeSession.date).toISOString();
    if (parsedSessionDate.toISOString() !== activeSessionDateISO) {
      return NextResponse.json({ error: 'This QR code is not valid for the current attendance session' }, { status: 409 });
    }

    const courseObjectId = new mongoose.Types.ObjectId(courseId);

    let student = null as any;
    let studentIdString = '';

    if (confirmedStudentId) {
      student = await Student.findOne({ studentId: confirmedStudentId, courseId: courseObjectId });
      studentIdString = confirmedStudentId;
    } else {
      // Never write attendance on the first pass. Always surface a match as a
      // "Is this you?" confirmation so the student can verify their own record
      // before it's recorded, whether the match came from a parsed ID or a name lookup.
      const displayName = (session.user.name || '').trim();
      const match = displayName.match(/\(([^)]+)\)/);
      const parsedId = match ? match[1].trim() : null;

      if (parsedId) {
        const candidate = await Student.findOne({ studentId: parsedId, courseId: courseObjectId });
        if (candidate) {
          return NextResponse.json({
            needsConfirmation: true,
            message: 'Is this you? Please confirm your name and student ID.',
            candidate: {
              studentId: candidate.studentId,
              name: candidate.name,
            },
          });
        }
      }

      if (displayName) {
        const students = await Student.find({ courseId: courseObjectId }).lean();
        const normalizedName = displayName.toLowerCase();

        const exactMatches = students.filter((item) => item.name.trim().toLowerCase() === normalizedName);
        const partialMatches = students.filter((item) => {
          const studentName = item.name.trim().toLowerCase();
          return studentName.includes(normalizedName) || normalizedName.includes(studentName);
        });

        const matches = exactMatches.length === 1 ? exactMatches : partialMatches;

        if (matches.length === 1) {
          const candidate = matches[0];
          return NextResponse.json({
            needsConfirmation: true,
            message: 'Is this you? Please confirm your name and student ID.',
            candidate: {
              studentId: candidate.studentId,
              name: candidate.name,
            },
          });
        }

        if (matches.length > 1) {
          return NextResponse.json(
            { error: 'Could not uniquely match student by name. Please include the student ID in your Google display name.' },
            { status: 400 }
          );
        }
      }

      return NextResponse.json({ error: 'Student not registered for this course' }, { status: 404 });
    }

    if (!student) {
      return NextResponse.json({ error: 'Student not registered for this course' }, { status: 404 });
    }

    if (!studentIdString) {
      studentIdString = student.studentId || '';
    }

    const existingIndex = activeSession.records.findIndex((record) => String(record.studentId) === String(student._id));
    const record = {
      studentId: student._id,
      status: 'present' as const,
      recordedAt: new Date(),
      markedBy: 'qr' as const,
      studentIdString,
    };

    if (existingIndex >= 0) {
      activeSession.records[existingIndex] = record as any;
    } else {
      activeSession.records.push(record as any);
    }

    await activeSession.save();

    return NextResponse.json({ message: 'Attendance recorded', ok: true, studentId: studentIdString });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error recording attendance' }, { status: 500 });
  }
}
