import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import User from '@/models/User';
import '@/models/Semester';
import { getCapstoneActor } from '@/lib/capstoneAuth';
import { COMPONENTS_BY_ROLE } from '@/lib/capstoneGrades';

// Groups the signed-in teacher supervises or actively evaluates, across all sessions, with
// what the My Groups cards need at a glance: their role, each student's journal progress,
// journal entries waiting for review, and how far they are with their own marks.
export async function GET() {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // The /admin panel's Web Admin is not a person, so it supervises and evaluates nothing.
    if (actor.systemAccount) return NextResponse.json([]);

    await dbConnect();

    const groups = await CapstoneGroup.find({
      $or: [
        { supervisorId: actor.userId },
        { evaluators: { $elemMatch: { evaluatorId: actor.userId, unassignedAt: null } } },
      ],
    })
      .populate({ path: 'sessionId', select: 'department status semesterId journalWeekCount', populate: { path: 'semesterId', select: 'name' } })
      .populate('members.studentAccountId', 'studentId name email')
      .sort({ createdAt: -1 })
      .lean();

    if (groups.length === 0) return NextResponse.json([]);
    const groupIds = groups.map((g) => g._id);

    const [journal, myMarks, supervisors] = await Promise.all([
      // Per student per group: submitted entries, and submitted-but-unreviewed entries.
      WeeklyJournalEntry.aggregate([
        { $match: { groupId: { $in: groupIds }, submittedAt: { $ne: null } } },
        {
          $group: {
            _id: { groupId: '$groupId', studentAccountId: '$studentAccountId' },
            submitted: { $sum: 1 },
            unreviewed: { $sum: { $cond: [{ $eq: ['$supervisorReviewedAt', null] }, 1, 0] } },
          },
        },
      ]),
      CapstoneMarkSubmission.find({
        groupId: { $in: groupIds },
        submitterId: new mongoose.Types.ObjectId(actor.userId),
        status: 'submitted',
      })
        .select('groupId studentAccountId component')
        .lean(),
      User.find({ _id: { $in: groups.map((g) => g.supervisorId) } }).select('name').lean(),
    ]);

    const journalKey = (g: unknown, s: unknown) => `${String(g)}:${String(s)}`;
    const journalBy = new Map(journal.map((j) => [journalKey(j._id.groupId, j._id.studentAccountId), j]));
    const supervisorName = new Map(supervisors.map((u) => [String(u._id), u.name]));

    const result = groups.map((g) => {
      const role: 'supervisor' | 'evaluator' = String(g.supervisorId) === actor.userId ? 'supervisor' : 'evaluator';
      const session = g.sessionId as unknown as {
        _id: unknown;
        department: string;
        status: string;
        journalWeekCount: number;
        semesterId?: { name?: string } | null;
      } | null;
      const active = g.members.filter((m) => !m.removedAt);

      const members = active.map((m) => {
        const account = m.studentAccountId as unknown as { _id: unknown; studentId: string; name: string; email?: string } | null;
        const id = String(account?._id ?? m.studentAccountId);
        const j = journalBy.get(journalKey(g._id, id));
        return {
          studentAccountId: id,
          studentId: account?.studentId || m.studentIdText,
          name: account?.name || '',
          email: account?.email || '',
          journalSubmitted: j?.submitted || 0,
        };
      });

      // For each component this grader's role submits: how many active members have their mark.
      const mine = myMarks.filter((s) => String(s.groupId) === String(g._id));
      const activeIds = new Set(members.map((m) => m.studentAccountId));
      const marks = COMPONENTS_BY_ROLE[role].map((component) => ({
        component,
        done: new Set(
          mine.filter((s) => s.component === component && activeIds.has(String(s.studentAccountId))).map((s) => String(s.studentAccountId))
        ).size,
        total: members.length,
      }));

      return {
        _id: String(g._id),
        track: g.track,
        groupNumber: g.groupNumber,
        projectTitle: g.projectTitle,
        reportUrl: g.reportUrl || null,
        lastJournalReminderAt: g.lastJournalReminderAt || null,
        role,
        supervisorName: supervisorName.get(String(g.supervisorId)) || null,
        session: session
          ? {
              _id: String(session._id),
              department: session.department,
              status: session.status,
              semesterName: session.semesterId?.name || null,
              journalWeekCount: session.journalWeekCount,
            }
          : null,
        members,
        journalUnreviewed: members.reduce((n, m) => n + (journalBy.get(journalKey(g._id, m.studentAccountId))?.unreviewed || 0), 0),
        marks,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/capstone/groups/mine error:', error);
    return NextResponse.json({ error: 'Failed to fetch your groups' }, { status: 500 });
  }
}
