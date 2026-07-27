import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Course from '@/models/Course';
import { verifyAdminToken } from '@/lib/adminAuth';
import { cascadeDeleteCourseData } from '@/lib/courseCascadeDelete';

export async function GET(request: NextRequest) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();

    const [users, courseCounts] = await Promise.all([
      User.find().select('name email role googleId createdAt').sort({ createdAt: -1 }).lean(),
      Course.aggregate([{ $group: { _id: '$userId', count: { $sum: 1 } } }]),
    ]);

    const countByUserId = new Map(courseCounts.map((c) => [String(c._id), c.count as number]));

    const accounts = users.map((user) => ({
      _id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role || 'user',
      provider: user.googleId ? 'google' : 'credentials',
      createdAt: user.createdAt,
      courseCount: countByUserId.get(String(user._id)) || 0,
    }));

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('List admin accounts error:', error);
    return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 });
  }
}

// Bulk delete accounts: { ids: string[], confirm: string }
// Deleting a single account requires typing its exact email (see accounts/[id] DELETE);
// that isn't feasible across a batch of different emails, so bulk delete instead requires
// typing the literal phrase "DELETE" as a deliberate, lower-friction-but-still-explicit gate.
export async function DELETE(request: NextRequest) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.filter((v: unknown) => typeof v === 'string') : [];
    const confirm = typeof body?.confirm === 'string' ? body.confirm.trim().toUpperCase() : '';

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Account ID(s) are required' }, { status: 400 });
    }

    if (confirm !== 'DELETE') {
      return NextResponse.json({ error: 'Confirmation text does not match' }, { status: 400 });
    }

    await dbConnect();

    const users = await User.find({ _id: { $in: ids } }).select('_id').lean();
    const resolvedIds = users.map((u) => String(u._id));

    let coursesDeleted = 0;
    for (const userId of resolvedIds) {
      const courses = await Course.find({ userId }).select('_id').lean();
      await Promise.all(courses.map((course) => cascadeDeleteCourseData(String(course._id))));
      await Course.deleteMany({ userId });
      coursesDeleted += courses.length;
    }
    await User.deleteMany({ _id: { $in: resolvedIds } });

    return NextResponse.json({
      message: 'Accounts and owned courses deleted',
      accountsDeleted: resolvedIds.length,
      coursesDeleted,
    });
  } catch (error) {
    console.error('Bulk delete admin accounts error:', error);
    return NextResponse.json({ error: 'Failed to delete accounts' }, { status: 500 });
  }
}
