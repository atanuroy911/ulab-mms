import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import StudentNotification from '@/models/StudentNotification';
import { portalStudent } from '@/lib/studentPortalAuth';

// The signed-in student's own notifications (the portal bell). GET lists the latest;
// POST { id } or { all: true } marks them read.

export async function GET() {
  const me = await portalStudent();
  if (!me) return NextResponse.json({ error: 'Sign in with your ULAB student Google account' }, { status: 401 });
  const studentId = me.studentIdText.toLowerCase();
  const [items, unread] = await Promise.all([
    StudentNotification.find({ studentId }).sort({ createdAt: -1 }).limit(30).select('kind title body href readAt createdAt').lean(),
    StudentNotification.countDocuments({ studentId, readAt: null }),
  ]);
  return NextResponse.json({
    unread,
    items: items.map((n) => ({ id: String(n._id), kind: n.kind, title: n.title, body: n.body, href: n.href, read: !!n.readAt, createdAt: n.createdAt })),
  });
}

export async function POST(request: NextRequest) {
  const me = await portalStudent();
  if (!me) return NextResponse.json({ error: 'Sign in with your ULAB student Google account' }, { status: 401 });
  // Only viewing as a student never changes their state - not even "read".
  if (!me.canWrite) return NextResponse.json({ error: 'Viewing as a student is read-only' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const studentId = me.studentIdText.toLowerCase();
  if (body?.all === true) {
    await StudentNotification.updateMany({ studentId, readAt: null }, { $set: { readAt: new Date() } });
  } else if (typeof body?.id === 'string' && mongoose.Types.ObjectId.isValid(body.id)) {
    // Only ever the student's own.
    await StudentNotification.updateOne({ _id: body.id, studentId }, { $set: { readAt: new Date() } });
  } else {
    return NextResponse.json({ error: 'Nothing to mark' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
