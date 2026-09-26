import { NextRequest, NextResponse, after } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import User from '@/models/User';
import StudentAccount from '@/models/StudentAccount';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';
import { getCapstoneActor, canManageDepartment, isGroupGrader, isGroupSupervisor } from '@/lib/capstoneAuth';
import {
  closeMissedWeek,
  flushStudentFeedbackEmails,
  journalMarksQuery,
  journalStatusFrom,
  notifyStudentOfDecision,
  reopenEntry,
  reviewEntry,
  syncJournalCompletion,
} from '@/lib/capstoneJournalWorkflow';

// GET: every journal entry for every active member of this group, plus the group's review
// status (supervisor's review screen). Evaluators and coordinators can read for oversight.
//
// On a remote database each round trip costs ~250ms, so this loads the group once and then
// everything else in one parallel batch (the scheme, only if pinned, is the one follow-up).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const memberIds = group.members.filter((m) => !m.removedAt).map((m) => m.studentAccountId);
    // Nothing below is returned until the permission check passes; fetching it alongside
    // the session just saves a round trip.
    const [session, students, entries, journalMarks] = await Promise.all([
      CapstoneSession.findById(group.sessionId).select('department journalWeekCount status tracks').lean(),
      StudentAccount.find({ _id: { $in: group.members.map((m) => m.studentAccountId) } }).select('studentId name').lean(),
      // By session, not group: a student who moved groups keeps their earlier weeks.
      WeeklyJournalEntry.find({ sessionId: group.sessionId, studentAccountId: { $in: memberIds } })
        .sort({ studentAccountId: 1, weekNumber: 1 })
        .lean(),
      journalMarksQuery(group),
    ]);

    const canManage = !!session && canManageDepartment(actor, session.department);
    if (!isGroupGrader(actor, group) && !canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = await journalStatusFrom(group, session, entries, journalMarks);
    const studentById = new Map(students.map((s) => [String(s._id), s]));
    const plain = group.toObject();

    return NextResponse.json({
      group: {
        ...plain,
        // Same shape as populating members.studentAccountId.
        members: plain.members.map((m) => ({ ...m, studentAccountId: studentById.get(String(m.studentAccountId)) ?? m.studentAccountId })),
      },
      entries,
      status,
      journalWeekCount: session?.journalWeekCount || 0,
      sessionStatus: session?.status,
      canReopen: canManage,
    });
  } catch (error) {
    console.error('GET /api/capstone/groups/[id]/journal error:', error);
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 });
  }
}

// PATCH: the supervisor's side of the review cycle (lib/capstoneJournalWorkflow.ts).
//   { action: 'review', entryId, feedback }                       - one pass; locks the entry
//   { action: 'reviewMany', entryIds, feedback }                  - the same, for many entries
//   { action: 'missed', studentAccountId, weekNumber, feedback? } - close a week never written
//   { action: 'reopen', entryId }                                 - coordinator/admin only
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const feedback = typeof body?.feedback === 'string' ? body.feedback.trim() : '';
    if (!['review', 'reviewMany', 'missed', 'reopen', 'notify'].includes(action)) {
      return NextResponse.json({ error: 'action must be review, reviewMany, missed, reopen or notify' }, { status: 400 });
    }
    if (feedback.length > 5000) {
      return NextResponse.json({ error: 'Please keep feedback under 5,000 characters' }, { status: 400 });
    }

    await dbConnect();
    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const [session, me] = await Promise.all([
      CapstoneSession.findById(group.sessionId).select('status journalWeekCount department tracks').lean(),
      User.findById(actor.userId).select('name').lean<{ name?: string }>(),
    ]);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const manager = canManageDepartment(actor, session.department);
    if (action === 'reopen' ? !manager : !isGroupSupervisor(actor, group) && !manager) {
      return NextResponse.json(
        { error: action === 'reopen' ? 'Only a coordinator can reopen a reviewed week' : 'Only the supervisor reviews journals' },
        { status: 403 }
      );
    }
    // Feedback is written as a person. The /admin panel's web-admin is not one.
    if (actor.systemAccount) {
      return NextResponse.json(
        { error: 'The admin panel cannot review journals. Sign in as a teacher account to do that.' },
        { status: 403 }
      );
    }

    if (session.status === 'closed' || session.status === 'draft') {
      return NextResponse.json({ error: `Journals cannot be reviewed while the session is ${session.status}` }, { status: 409 });
    }

    const actorName = me?.name || 'Your supervisor';
    if (action === 'notify') {
      // Sends whatever feedback is still owed, one digest per student.
      const result = await flushStudentFeedbackEmails(group, actorName);
      return NextResponse.json(result);
    }

    if (action === 'review') {
      const entryId = typeof body?.entryId === 'string' ? body.entryId : '';
      if (!mongoose.Types.ObjectId.isValid(entryId)) return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
      const result = await reviewEntry(group, entryId, feedback, actor.userId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      // No email per week: students get one digest when the review screen closes (action
      // 'notify') - or, failing that, the next time this journal is opened.
      const status = await syncJournalCompletion(group._id, { schedule: after, session, group });
      return NextResponse.json({ entry: result.value, status });
    }

    if (action === 'reviewMany') {
      // Bulk review: the same feedback (or a plain acknowledgement) on many submitted weeks.
      // Each entry is still its own atomic one-pass review, so one already reviewed elsewhere
      // is just reported back, not overwritten.
      const ids: string[] = Array.isArray(body?.entryIds)
        ? [...new Set<string>(body.entryIds.filter((x: unknown) => typeof x === 'string' && mongoose.Types.ObjectId.isValid(x)))]
        : [];
      if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one entry' }, { status: 400 });
      if (ids.length > 300) return NextResponse.json({ error: 'Review at most 300 entries at once' }, { status: 400 });
      const results = await Promise.all(ids.map((entryId) => reviewEntry(group, entryId, feedback, actor.userId)));
      const entries = results.flatMap((r) => (r.ok ? [r.value] : []));
      // One email per student for the whole batch, sent one after another.
      after(() => flushStudentFeedbackEmails(group, actorName));
      const status = await syncJournalCompletion(group._id, { schedule: after, session, group });
      return NextResponse.json({ entries, skipped: ids.length - entries.length, status });
    }

    if (action === 'missed') {
      const studentAccountId = typeof body?.studentAccountId === 'string' ? body.studentAccountId : '';
      const weekNumber = Number(body?.weekNumber);
      if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > session.journalWeekCount) {
        return NextResponse.json({ error: `Week must be between 1 and ${session.journalWeekCount}` }, { status: 400 });
      }
      const result = await closeMissedWeek(group, studentAccountId, weekNumber, feedback, actor.userId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      after(() => flushStudentFeedbackEmails(group, actorName));
      const status = await syncJournalCompletion(group._id, { schedule: after, session, group });
      return NextResponse.json({ entry: result.value, status });
    }

    // reopen
    const entryId = typeof body?.entryId === 'string' ? body.entryId : '';
    if (!mongoose.Types.ObjectId.isValid(entryId)) return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
    const result = await reopenEntry(group, entryId, actor.userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    after(() => notifyStudentOfDecision(group, result.value, 'reopened', actorName));
    const status = await syncJournalCompletion(group._id, { schedule: after, session, group });
    return NextResponse.json({ reopened: true, status });
  } catch (error) {
    console.error('PATCH /api/capstone/groups/[id]/journal error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update the journal' }, { status: 500 });
  }
}
