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
import { buildCoPoReportData, buildCoPoPdfHtml } from '@/lib/coPoPdfReport';
import { getProjectCoMarksByStudent } from '@/lib/coPoCalculations';

// Renders the full course file (GradeSheet, GradingPolicy, CourseSummary,
// CO_PO_AttainmentAnalysis, ContinuousQualityImprovement) as one print-ready HTML document -
// no Excel file involved, pure calculation + HTML/CSS (see lib/coPoPdfReport.ts). GET (not
// POST) because the client opens this directly via window.open() and lets the browser's
// Print -> Save as PDF handle the actual PDF generation, same pattern as
// app/api/courses/[id]/attendance-pdf.
export async function GET(
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

    const { searchParams } = new URL(request.url);
    const group = searchParams.get('group') === 'alias' ? 'alias' : 'main';
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

    const data = buildCoPoReportData({
      course: courseForExport,
      students,
      exams,
      marks,
      attendanceSessions,
      projectCoMarksByStudent,
      instructorName: session.user?.name || '',
    });

    const html = buildCoPoPdfHtml(data);

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('Export CO-PO PDF (alpha) error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
