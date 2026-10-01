import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { courseReport, enrolments, projectGroupFor } from '@/lib/studentPortal';
import { portalStudent } from '@/lib/studentPortalAuth';

// One of the signed-in student's own courses: marks, attendance and their project group.
// Read only, and only for a course they are enrolled in.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const me = await portalStudent();
    if (!me) return NextResponse.json({ error: 'Sign in with your ULAB student Google account' }, { status: 401 });
    const { courseId } = await params;
    if (!mongoose.Types.ObjectId.isValid(courseId)) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

    const record = (await enrolments(me.studentIdText)).find((r) => String(r.courseId) === courseId);
    // Same answer for "no such course" and "not yours", so course ids can't be probed.
    if (!record) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

    const [report, project] = await Promise.all([courseReport(record), projectGroupFor(courseId, String(record._id))]);
    if (!report) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    return NextResponse.json({ report, project });
  } catch (error) {
    console.error('GET /api/student/portal/courses/[courseId] error:', error);
    return NextResponse.json({ error: 'Failed to load the course' }, { status: 500 });
  }
}
