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

    const attendedSessions = sessions.filter(session =>
      session.records.some((record: any) => record.studentIdString === studentId)
    );

    const totalSessions = sessions.length;
    const attendedCount = attendedSessions.length;
    const percentage = totalSessions > 0 ? (attendedCount / totalSessions) * 100 : 0;

    const sessionDetails = sessions.map(session => {
      const attended = session.records.some((record: any) => record.studentIdString === studentId);
      return {
        id: session._id.toString(),
        date: session.date,
        attended,
      };
    });

    return NextResponse.json({
      courseId: course._id.toString(),
      courseName: course.name,
      courseCode: course.code,
      totalSessions,
      attendedSessions: attendedCount,
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
