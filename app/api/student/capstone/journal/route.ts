import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';

// Student submits/updates their own weekly journal entry. Body: { groupId, weekNumber,
// periodStart?, periodEnd?, workDone }
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const anyUser = session?.user as any;
    if (!anyUser?.studentSession || !anyUser.studentAccountId) {
      return NextResponse.json({ error: 'Please sign in with your student Google account' }, { status: 401 });
    }
    const studentAccountId = anyUser.studentAccountId;

    const body = await request.json().catch(() => ({}));
    const groupId = typeof body?.groupId === 'string' ? body.groupId : '';
    const weekNumber = Number(body?.weekNumber);
    const workDone = typeof body?.workDone === 'string' ? body.workDone : '';
    const periodStart = body?.periodStart ? new Date(body.periodStart) : null;
    const periodEnd = body?.periodEnd ? new Date(body.periodEnd) : null;

    if (!groupId || !Number.isFinite(weekNumber) || weekNumber < 1) {
      return NextResponse.json({ error: 'groupId and a valid weekNumber are required' }, { status: 400 });
    }
    if (!workDone.trim()) {
      return NextResponse.json({ error: 'Please describe the work done this week' }, { status: 400 });
    }

    await dbConnect();

    const group = await CapstoneGroup.findById(groupId);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const isActiveMember = group.members.some(
      (m) => String(m.studentAccountId) === studentAccountId && !m.removedAt
    );
    if (!isActiveMember) {
      return NextResponse.json({ error: 'You are not an active member of this group' }, { status: 403 });
    }

    const capstoneSession = await CapstoneSession.findById(group.sessionId).select('journalWeekCount status');
    if (!capstoneSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (weekNumber > capstoneSession.journalWeekCount) {
      return NextResponse.json({ error: `This session only has ${capstoneSession.journalWeekCount} weeks` }, { status: 400 });
    }
    if (capstoneSession.status !== 'open') {
      return NextResponse.json({ error: 'Journal entries can only be submitted while the session is open' }, { status: 409 });
    }

    const entry = await WeeklyJournalEntry.findOneAndUpdate(
      { sessionId: group.sessionId, studentAccountId, weekNumber },
      {
        $set: {
          groupId: group._id,
          periodStart,
          periodEnd,
          workDone,
          submittedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json(entry);
  } catch (error: any) {
    console.error('POST /api/student/capstone/journal error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save journal entry' }, { status: 500 });
  }
}
