import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import User from '@/models/User';
import '@/models/Semester';
import { getCapstoneActor } from '@/lib/capstoneAuth';
import { getMarkingPlan } from '@/lib/capstoneMarkingPlan';
import { groupJournalStatus } from '@/lib/capstoneJournalStatus';

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
      // Every journal entry of these groups' students, by session (a student who moved groups
      // keeps their weeks) - counted below exactly as the group's journal tab counts them.
      WeeklyJournalEntry.find({
        sessionId: { $in: [...new Set(groups.map((g) => String((g.sessionId as unknown as { _id?: unknown } | null)?._id ?? g.sessionId)))] },
        studentAccountId: { $in: groups.flatMap((g) => g.members.filter((m) => !m.removedAt).map((m) => (m.studentAccountId as unknown as { _id?: unknown })?._id ?? m.studentAccountId)) },
      })
        .select('sessionId studentAccountId weekNumber submittedAt supervisorReviewedAt')
        .lean(),
      CapstoneMarkSubmission.find({
        groupId: { $in: groupIds },
        submitterId: new mongoose.Types.ObjectId(actor.userId),
        status: 'submitted',
      })
        .select('groupId studentAccountId component')
        .lean(),
      User.find({ _id: { $in: groups.map((g) => g.supervisorId) } }).select('name').lean(),
    ]);

    // Marking tasks per (session, track) from the active scheme - one lookup per pair, not per group.
    const planFor = new Map<string, Awaited<ReturnType<typeof getMarkingPlan>>>();
    for (const g of groups) {
      const sessionId = (g.sessionId as unknown as { _id?: unknown } | null)?._id;
      const key = `${String(sessionId)}:${g.track}`;
      if (sessionId && !planFor.has(key)) planFor.set(key, await getMarkingPlan(sessionId, g.track));
    }

    const entriesBySession = new Map<string, typeof journal>();
    for (const e of journal) {
      const key = String(e.sessionId);
      if (!entriesBySession.has(key)) entriesBySession.set(key, []);
      entriesBySession.get(key)!.push(e);
    }
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

      const memberIds = active.map((m) => String((m.studentAccountId as unknown as { _id?: unknown })?._id ?? m.studentAccountId));
      // The same numbers the group's journal tab shows (weeks beyond the session's count ignored).
      const journalStatus = groupJournalStatus({
        weekCount: session?.journalWeekCount || 0,
        memberIds,
        entries: (entriesBySession.get(String(session?._id)) || []).map((e) => ({ ...e, studentAccountId: String(e.studentAccountId) })),
        journalMarks: new Map(),
        marksRequired: false,
      });
      const statusOf = new Map(journalStatus.members.map((m) => [m.studentAccountId, m]));

      const members = active.map((m, i) => {
        const account = m.studentAccountId as unknown as { _id: unknown; studentId: string; name: string; email?: string } | null;
        const id = memberIds[i];
        const st = statusOf.get(id);
        return {
          studentAccountId: id,
          studentId: account?.studentId || m.studentIdText,
          name: account?.name || '',
          email: account?.email || '',
          journalSubmitted: st ? st.reviewed + st.awaiting : 0,
        };
      });

      // For each component this grader's role submits: how many active members have their mark.
      const mine = myMarks.filter((s) => String(s.groupId) === String(g._id));
      const activeIds = new Set(members.map((m) => m.studentAccountId));
      const marks = (planFor.get(`${String(session?._id)}:${g.track}`)?.[role] || []).map(({ component }) => ({
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
        journalCompletedAt: g.journalCompletedAt || null,
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
        journalUnreviewed: journalStatus.awaitingReview,
        // Group-wide journal counts, in student-weeks (weeks x students).
        journal: {
          toReview: journalStatus.awaitingReview,
          reviewed: journalStatus.members.reduce((n, m) => n + m.reviewed, 0),
          missed: journalStatus.members.reduce((n, m) => n + m.missed, 0),
          notWritten: journalStatus.members.reduce((n, m) => n + m.notStarted, 0),
          total: journalStatus.weeksTotal,
        },
        marks,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/capstone/groups/mine error:', error);
    return NextResponse.json({ error: 'Failed to fetch your groups' }, { status: 500 });
  }
}
