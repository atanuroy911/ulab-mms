import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { isUlabSessionOrAdminAuthorized } from '@/lib/studentAuth';
import { escapeRegExp } from '@/lib/utils';
import AttendanceSession from '@/models/AttendanceSession';
import Course from '@/models/Course';
import Student from '@/models/Student';

// POST (not GET) so an admin-password override never lands in a URL / server access log.
// Attendance is only released after the visitor either signs in with a real @ulab.edu.bd
// Google account (dashboard, attendance check-in, or check-marks sessions all qualify) or a
// teacher/admin supplies the admin password. Without this, anyone who knows/guesses a
// courseId + roll number could pull a student's full attendance history anonymously.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    await dbConnect();

    const body = await request.json().catch(() => ({}));
    const studentId = typeof body?.studentId === 'string' ? body.studentId.trim() : '';
    const adminPassword = typeof body?.adminPassword === 'string' ? body.adminPassword : undefined;

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    if (!(await isUlabSessionOrAdminAuthorized(adminPassword))) {
      return NextResponse.json(
        { error: adminPassword ? 'Invalid admin password' : 'Please sign in with your ULAB Google account to check attendance' },
        { status: 401 }
      );
    }

    const { courseId } = await params;

    const course = await Course.findById(courseId);

    if (!course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // studentId here is the roll number (e.g. "2021-1-60-123"), not the Student
    // document's ObjectId -- resolve it so records can be matched by the
    // authoritative studentId ObjectId ref, the same way the teacher's
    // attendance view does. studentIdString is only a denormalized snapshot
    // taken at write time and goes stale if the roll number is ever edited.
    const studentDoc = await Student.findOne({
      courseId,
      studentId: { $regex: new RegExp(`^${escapeRegExp(studentId)}$`, 'i') },
    });

    const sessions = await AttendanceSession.find({ courseId }).sort({ date: 1 });

    // A session counts as "present" only if this student has a record marked
    // present -- an explicit 'absent' record (e.g. from bulk marking) must
    // not count as attended just because a record exists.
    const isPresent = (session: any) =>
      session.records.some((record: any) =>
        (studentDoc ? String(record.studentId) === String(studentDoc._id) : record.studentIdString === studentId)
        && record.status === 'present'
      );

    const totalSessions = sessions.length;
    const presentCount = sessions.filter(isPresent).length;
    const absentCount = totalSessions - presentCount;
    const percentage = totalSessions > 0 ? (presentCount / totalSessions) * 100 : 0;

    const sessionDetails = sessions.map(session => ({
      id: session._id.toString(),
      date: session.date,
      attended: isPresent(session),
    }));

    return NextResponse.json({
      courseId: course._id.toString(),
      courseName: course.name,
      courseCode: course.code,
      totalSessions,
      attendedSessions: presentCount,
      presentSessions: presentCount,
      absentSessions: absentCount,
      percentage: Math.round(percentage * 100) / 100,
      sessions: sessionDetails,
    });
  } catch (error: any) {
    console.error('Error fetching attendance stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attendance stats' },
      { status: 500 }
    );
  }
}
