import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Course from '@/models/Course';
import { verifyAdminToken } from '@/lib/adminAuth';

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
