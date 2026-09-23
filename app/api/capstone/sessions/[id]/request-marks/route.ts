import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import User from '@/models/User';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';
import { sendMarkRequestEmails } from '@/lib/capstoneNotifications';

// POST /api/capstone/sessions/[id]/request-marks
// Emails all active supervisors and evaluators across every group in this session.
// Admin or coordinator for this department only.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const session = await CapstoneSession.findById(id).populate('semesterId', 'name');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    if (!isAdmin(actor) && !isCoordinatorFor(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Collect all unique supervisor + active evaluator user IDs across all groups in session
    const groups = await CapstoneGroup.find({ sessionId: id });
    const userIdSet = new Set<string>();

    for (const group of groups) {
      if (group.supervisorId) userIdSet.add(String(group.supervisorId));
      for (const ev of group.evaluators) {
        if (!ev.unassignedAt && ev.evaluatorId) {
          userIdSet.add(String(ev.evaluatorId));
        }
      }
    }

    if (userIdSet.size === 0) {
      return NextResponse.json({ sent: 0, failed: 0, note: 'No supervisors or evaluators found' });
    }

    // Fetch their names + emails
    const users = await User.find({ _id: { $in: [...userIdSet] } }).select('name email');
    const recipients = users
      .filter((u) => u.email)
      .map((u) => ({ name: u.name || 'Faculty', email: u.email }));

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    const semesterName = typeof session.semesterId === 'object' && session.semesterId !== null
      ? (session.semesterId as any).name
      : '';

    const result = await sendMarkRequestEmails(
      { _id: String(session._id), department: session.department, semesterName },
      recipients,
      baseUrl
    );

    return NextResponse.json({
      sent: result.sent,
      failed: result.failed,
      total: recipients.length,
    });
  } catch (error: any) {
    console.error('POST /api/capstone/sessions/[id]/request-marks error:', error);
    return NextResponse.json({ error: error.message || 'Failed to send notifications' }, { status: 500 });
  }
}
