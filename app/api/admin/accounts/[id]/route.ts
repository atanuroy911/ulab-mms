import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Course from '@/models/Course';
import Student from '@/models/Student';
import { verifyAdminToken } from '@/lib/adminAuth';
import { cascadeDeleteCourseData } from '@/lib/courseCascadeDelete';

async function resolveId(params: Promise<{ id: string }>) {
  const resolved = await params;
  return resolved.id;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const id = await resolveId(params);

    const user = await User.findById(id).select('name email role googleId createdAt').lean();
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const courses = await Course.find({ userId: id })
      .select('name code semester year section courseType isArchived createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const studentCounts = await Student.aggregate([
      { $match: { courseId: { $in: courses.map((c) => c._id) } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]);
    const countByCourseId = new Map(studentCounts.map((c) => [String(c._id), c.count as number]));

    return NextResponse.json({
      account: {
        _id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        provider: user.googleId ? 'google' : 'credentials',
        createdAt: user.createdAt,
      },
      courses: courses.map((course) => ({
        _id: String(course._id),
        name: course.name,
        code: course.code,
        semester: course.semester,
        year: course.year,
        section: course.section,
        courseType: course.courseType,
        isArchived: course.isArchived,
        createdAt: course.createdAt,
        studentCount: countByCourseId.get(String(course._id)) || 0,
      })),
    });
  } catch (error) {
    console.error('Get admin account error:', error);
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const id = await resolveId(params);
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const user = await User.findByIdAndUpdate(id, { name }, { new: true, runValidators: true }).select('name email role');
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ account: { _id: String(user._id), name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Update admin account error:', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    const id = await resolveId(params);
    const body = await request.json().catch(() => ({}));
    const confirmEmail = typeof body?.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : '';

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (confirmEmail !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Confirmation email does not match this account' }, { status: 400 });
    }

    const courses = await Course.find({ userId: id }).select('_id').lean();
    await Promise.all(courses.map((course) => cascadeDeleteCourseData(String(course._id))));
    await Course.deleteMany({ userId: id });
    await User.findByIdAndDelete(id);

    return NextResponse.json({ message: 'Account and all owned courses deleted', coursesDeleted: courses.length });
  } catch (error) {
    console.error('Delete admin account error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
