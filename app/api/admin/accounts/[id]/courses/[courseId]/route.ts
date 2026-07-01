import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import { verifyAdminToken } from '@/lib/adminAuth';
import { cascadeDeleteCourseData } from '@/lib/courseCascadeDelete';

async function resolveParams(params: Promise<{ id: string; courseId: string }>) {
  const resolved = await params;
  return resolved;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; courseId: string }> }) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const { id: accountId, courseId } = await resolveParams(params);
    const body = await request.json().catch(() => ({}));

    const updateData: Record<string, unknown> = {};
    if (typeof body?.name === 'string' && body.name.trim()) updateData.name = body.name.trim();
    if (typeof body?.code === 'string' && body.code.trim()) updateData.code = body.code.trim();
    if (typeof body?.semester === 'string') {
      if (!['Spring', 'Summer', 'Fall'].includes(body.semester)) {
        return NextResponse.json({ error: 'Invalid semester' }, { status: 400 });
      }
      updateData.semester = body.semester;
    }
    if (body?.year !== undefined) {
      const year = Number(body.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
      }
      updateData.year = year;
    }
    if (typeof body?.section === 'string' && body.section.trim()) updateData.section = body.section.trim();

    const course = await Course.findOneAndUpdate(
      { _id: courseId, userId: accountId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!course) {
      return NextResponse.json({ error: 'Course not found for this account' }, { status: 404 });
    }

    return NextResponse.json({ course });
  } catch (error) {
    console.error('Update admin-managed course error:', error);
    return NextResponse.json({ error: 'Failed to update course' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; courseId: string }> }) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const { id: accountId, courseId } = await resolveParams(params);

    const course = await Course.findOneAndDelete({ _id: courseId, userId: accountId });
    if (!course) {
      return NextResponse.json({ error: 'Course not found for this account' }, { status: 404 });
    }

    await cascadeDeleteCourseData(courseId);

    return NextResponse.json({ message: 'Course and all related data deleted' });
  } catch (error) {
    console.error('Delete admin-managed course error:', error);
    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
  }
}
