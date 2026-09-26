import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';

// Resolves the signed-in student's active capstone group(s) - identity comes only from the
// session's studentAccountId (set at sign-in, see app/api/auth/[...nextauth]/route.ts),
// never from a client-supplied id, closing the same class of bug fixed in
// app/api/student/marks/route.ts.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const anyUser = session?.user as any;
    if (!anyUser?.studentSession) {
      return NextResponse.json({ error: 'Please sign in with your student Google account' }, { status: 401 });
    }
    const studentAccountId = anyUser.studentAccountId;
    if (!studentAccountId) {
      return NextResponse.json({ error: 'Could not resolve your student account' }, { status: 404 });
    }

    await dbConnect();

    const groups = await CapstoneGroup.find({
      members: { $elemMatch: { studentAccountId, removedAt: null } },
    })
      .populate('sessionId')
      .populate('supervisorId', 'name email')
      .populate('members.studentAccountId', 'studentId name email');

    const results = [];
    for (const group of groups) {
      const capstoneSession = group.sessionId as any;
      // By session, not group: a student who moved groups keeps the weeks they already wrote
      // (the journal is unique per session + student + week).
      const entries = await WeeklyJournalEntry.find({
        sessionId: capstoneSession?._id,
        studentAccountId,
      })
        .select('weekNumber workDone submittedAt supervisorComment supervisorReviewedAt reopenedAt updatedAt')
        .sort({ weekNumber: 1 });

      results.push({
        group,
        session: capstoneSession,
        journalEntries: entries,
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/student/capstone error:', error);
    return NextResponse.json({ error: 'Failed to fetch capstone info' }, { status: 500 });
  }
}
