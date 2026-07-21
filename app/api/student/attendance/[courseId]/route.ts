import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceSession from '@/models/AttendanceSession';
import Course from '@/models/Course';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
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

    const sessions = await AttendanceSession.find({ courseId }).sort({ date: 1 });

    // A session counts as "present" only if this student has a record marked
    // present -- an explicit 'absent' record (e.g. from bulk marking) must
    // not count as attended just because a record exists.
    const isPresent = (session: any) =>
      session.records.some((record: any) => record.studentIdString === studentId && record.status === 'present');

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
