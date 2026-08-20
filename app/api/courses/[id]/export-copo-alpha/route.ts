import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import AttendanceSession from '@/models/AttendanceSession';
import ProjectGroup from '@/models/ProjectGroup';
import { buildDynamicCoPoWorkbook } from '@/lib/coPoDynamicExport';
import { getProjectCoMarksByStudent } from '@/lib/coPoCalculations';

// Alpha export: same CO-PO course file as the Beta export, but the student table grows or
// shrinks to the real roster size instead of being capped at 50 rows. See
// lib/coPoDynamicExport.ts for why this is a separate implementation.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: courseId } = await params;
    await dbConnect();

    const course = await Course.findOne({ _id: courseId, userId: session.user.id });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const group = body?.group === 'alias' ? 'alias' : 'main';
    const useSplit = Boolean(course.aliasEnabled && course.alternateCode);

    const allStudents = await Student.find({ courseId })
      .sort({ studentId: 1, _id: 1 })
      .collation({ locale: 'en', numericOrdering: true });
    const students = useSplit
      ? allStudents.filter((s) => (group === 'alias' ? s.useAlias : !s.useAlias))
      : allStudents;
    const exams = await Exam.find({ courseId });
    const marks = await Mark.find({ courseId });
    const attendanceSessions = await AttendanceSession.find({ courseId });
    const projectGroupDoc = await ProjectGroup.findOne({ courseId });
    const projectCoMarksByStudent = getProjectCoMarksByStudent(projectGroupDoc?.groups || []);

    const courseForExport = useSplit && group === 'alias'
      ? { ...course.toObject(), code: course.alternateCode }
      : course;

    const buffer = await buildDynamicCoPoWorkbook({
      course: courseForExport,
      students,
      exams,
      marks,
      attendanceSessions,
      projectCoMarksByStudent,
      instructorName: session.user?.name || '',
    });

    const filenameSuffix = useSplit ? (group === 'alias' ? '_newcode' : '_oldcode') : '';
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${courseForExport.code}_${course.name}_course_file_alpha${filenameSuffix}_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Export CO-PO (alpha) error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
