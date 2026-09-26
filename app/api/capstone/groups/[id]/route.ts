import { NextRequest, NextResponse, after } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import Semester from '@/models/Semester';
import User from '@/models/User';
import StudentAccount from '@/models/StudentAccount';
import CapstoneGroup, { CHOOSABLE_COMPONENTS, MIN_CHOSEN_EVALUATORS } from '@/models/CapstoneGroup';
import { getCapstoneActor, canManageGroup, canManageDepartment, isGroupSupervisor, isGroupGrader } from '@/lib/capstoneAuth';
import { assignableUserError } from '@/lib/webAdminAccount';
import { markingPlanForSession } from '@/lib/capstoneMarkingPlan';

const VALID_REMOVE_REASONS = ['dropped', 'transferred', 'withdrawn', 'admin-correction'];
import { deleteGroupCascade } from '@/lib/capstoneCascadeDelete';
import { syncJournalCompletion, notifyNewSupervisor } from '@/lib/capstoneJournalWorkflow';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    // One parallel batch instead of populate + separate session lookups: each round trip to
    // the remote database is ~250ms. Nothing is returned before the permission check.
    const userIds = [group.supervisorId, ...group.evaluators.map((e) => e.evaluatorId)];
    const [session, users, students] = await Promise.all([
      CapstoneSession.findById(group.sessionId).select('department tracks status semesterId').lean(),
      User.find({ _id: { $in: userIds } }).select('name email').lean(),
      StudentAccount.find({ _id: { $in: group.members.map((m) => m.studentAccountId) } }).select('studentId name email').lean(),
    ]);
    const canManage = !!session && canManageDepartment(actor, session.department);
    if (!canManage && !isGroupGrader(actor, group)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Which marks the supervisor and evaluators give, read from the track's active scheme,
    // so the page shows exactly the marking tasks the scheme will grade from.
    const [markingPlan, semester] = await Promise.all([
      markingPlanForSession(session, group.track),
      session?.semesterId ? Semester.findById(session.semesterId).select('name').lean<{ name?: string }>() : null,
    ]);

    // The same shape populate() gave (ids replaced by { _id, name, ... }); an id whose
    // document is gone stays a plain id rather than becoming null.
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const studentById = new Map(students.map((s) => [String(s._id), s]));
    const plain = group.toObject();
    return NextResponse.json({
      ...plain,
      supervisorId: userById.get(String(plain.supervisorId)) ?? plain.supervisorId,
      evaluators: plain.evaluators.map((e) => ({ ...e, evaluatorId: userById.get(String(e.evaluatorId)) ?? e.evaluatorId })),
      members: plain.members.map((m) => ({ ...m, studentAccountId: studentById.get(String(m.studentAccountId)) ?? m.studentAccountId })),
      markingPlan,
      sessionStatus: session?.status,
      semesterName: semester?.name ?? null,
      // What this viewer may do here, decided here rather than from their roles in the browser.
      canManage,
      canChooseEvaluators: canManage && !isGroupGrader(actor, group),
    });
  } catch (error) {
    console.error('GET /api/capstone/groups/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch group' }, { status: 500 });
  }
}

// Coordinator/admin can update project title, supervisor, and remove members.
// Supervisors can only update the project title (and only via the student-facing route in
// practice, but this endpoint also allows it for a supervisor helping a group fix a typo).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const canManage = await canManageGroup(actor, group);
    // Only the supervisor (never an evaluator) may help a group fix its title/abstract - the
    // comment above this route used to say "supervisors" but the check accidentally used
    // isGroupGrader, which also includes evaluators.
    const canEditTitle = canManage || (isGroupSupervisor(actor, group) && group.track === 'A');

    if (typeof body?.projectTitle === 'string') {
      if (!canEditTitle) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      group.projectTitle = body.projectTitle.trim();
    }

    if (typeof body?.projectAbstract === 'string') {
      if (!canEditTitle) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      group.projectAbstract = body.projectAbstract.trim();
    }

    let previousSupervisorId: string | null = null;
    if (typeof body?.supervisorId === 'string') {
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      // A group's supervisor must not also be an active evaluator of the same group - see
      // models/CapstoneMarkSubmission.ts for why (a dual role would let one person's score
      // count twice toward the same student).
      const stillEvaluator = group.evaluators.some(
        (e) => !e.unassignedAt && String(e.evaluatorId) === body.supervisorId
      );
      if (stillEvaluator) {
        return NextResponse.json(
          { error: 'This person is an active evaluator of this group - remove that assignment first' },
          { status: 400 }
        );
      }
      const supervisorError = await assignableUserError(body.supervisorId);
      if (supervisorError) return NextResponse.json({ error: supervisorError }, { status: 400 });
      if (String(group.supervisorId) !== body.supervisorId) previousSupervisorId = String(group.supervisorId);
      group.supervisorId = body.supervisorId;
    }

    if (typeof body?.removeMemberStudentAccountId === 'string') {
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const removeReason = body?.removeReason || 'dropped';
      if (!VALID_REMOVE_REASONS.includes(removeReason)) {
        return NextResponse.json({ error: `removeReason must be one of ${VALID_REMOVE_REASONS.join(', ')}` }, { status: 400 });
      }
      const member = group.members.find(
        (m) => String(m.studentAccountId) === body.removeMemberStudentAccountId && !m.removedAt
      );
      if (member) {
        member.removedAt = new Date();
        member.removedReason = removeReason;
        member.removedBy = actor.userId as any;
      }
    }

    // Report URL — coordinator/admin or supervisor can set
    if ('reportUrl' in body) {
      if (!canManage && !isGroupSupervisor(actor, group)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const url = typeof body.reportUrl === 'string' ? body.reportUrl.trim() : null;
      group.reportUrl = url || null;
    }

    // Chosen evaluators — coordinator/admin only. Per component (presentation/report): two or
    // more (up to every active evaluator), or none to clear the choice. With only one or two
    // evaluators nothing needs choosing - all of them count (countedEvaluators).
    //
    // Accepts the per-component shape: { chosenEvaluators: { presentation: [...], report: [...] } }.
    // A component that is omitted is left untouched, so the UI can save one panel at a time
    // without clobbering the other.
    if (body?.chosenEvaluators && typeof body.chosenEvaluators === 'object') {
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      // Whoever grades this group (even a coordinator or admin) must not pick whose marks count.
      if (isGroupGrader(actor, group)) {
        return NextResponse.json({ error: "You grade this group, so you can't choose which evaluators count - another coordinator has to" }, { status: 403 });
      }

      const activeEvaluatorIds = new Set(
        group.evaluators.filter((e) => !e.unassignedAt).map((e) => String(e.evaluatorId))
      );

      for (const component of CHOOSABLE_COMPONENTS) {
        const incoming = body.chosenEvaluators[component];
        if (incoming === undefined) continue;

        if (!Array.isArray(incoming)) {
          return NextResponse.json(
            { error: `chosenEvaluators.${component} must be an array` },
            { status: 400 }
          );
        }

        // Dedupe before counting, so the same evaluator sent twice can't consume both slots
        // or trip the limit check spuriously.
        const chosen = [...new Set(incoming.map(String).filter(Boolean))];

        // An average of one evaluator is no panel at all, so a real choice is at least two -
        // unless the group only has one evaluator to begin with.
        const minimum = Math.min(MIN_CHOSEN_EVALUATORS, activeEvaluatorIds.size);
        if (chosen.length > 0 && chosen.length < minimum) {
          return NextResponse.json(
            { error: `Choose at least ${minimum} evaluators whose ${component} marks count (or clear the choice)` },
            { status: 400 }
          );
        }

        const invalid = chosen.filter((id) => !activeEvaluatorIds.has(id));
        if (invalid.length > 0) {
          return NextResponse.json(
            { error: `Some chosen ${component} evaluators are not active evaluators of this group` },
            { status: 400 }
          );
        }

        if (!group.chosenEvaluators) {
          group.chosenEvaluators = { presentation: [], report: [] } as any;
        }
        group.chosenEvaluators[component] = chosen as any;
      }

      group.markModified('chosenEvaluators');
    }

    // Average (default) or best of the chosen evaluators, per component.
    if (body?.chosenAggregate && typeof body.chosenAggregate === 'object') {
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      // Whoever grades this group (even a coordinator or admin) must not pick whose marks count.
      if (isGroupGrader(actor, group)) {
        return NextResponse.json({ error: "You grade this group, so you can't choose which evaluators count - another coordinator has to" }, { status: 403 });
      }
      const next = { presentation: group.chosenAggregate?.presentation || 'mean', report: group.chosenAggregate?.report || 'mean' };
      for (const component of CHOOSABLE_COMPONENTS) {
        const value = body.chosenAggregate[component];
        if (value === undefined) continue;
        if (value !== 'mean' && value !== 'max') {
          return NextResponse.json({ error: `chosenAggregate.${component} must be "mean" or "max"` }, { status: 400 });
        }
        next[component] = value;
      }
      group.chosenAggregate = next;
      group.markModified('chosenAggregate');
    }

    // Top K per component: each student's K highest evaluator marks count (null turns it off).
    if (body?.evaluatorTopK && typeof body.evaluatorTopK === 'object') {
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (isGroupGrader(actor, group)) {
        return NextResponse.json({ error: "You grade this group, so you can't choose which evaluators count - another coordinator has to" }, { status: 403 });
      }
      const activeCount = group.evaluators.filter((e) => !e.unassignedAt).length;
      const next = { presentation: group.evaluatorTopK?.presentation ?? null, report: group.evaluatorTopK?.report ?? null };
      for (const component of CHOOSABLE_COMPONENTS) {
        const value = body.evaluatorTopK[component];
        if (value === undefined) continue;
        if (value === null || value === 0) {
          next[component] = null;
          continue;
        }
        if (!Number.isInteger(value) || value < 1 || value > activeCount) {
          return NextResponse.json(
            { error: `Top K for ${component} must be a whole number from 1 to ${activeCount} (this group's evaluators)` },
            { status: 400 }
          );
        }
        next[component] = value;
        // Top K draws from every evaluator, so a picked list would only confuse - clear it.
        if (group.chosenEvaluators) {
          group.chosenEvaluators[component] = [] as any;
          group.markModified('chosenEvaluators');
        }
      }
      group.evaluatorTopK = next;
      group.markModified('evaluatorTopK');
    }

    await group.save();
    // A new supervisor is told they have the group (after the response; never fails it).
    if (previousSupervisorId) {
      const [actorUser, previous] = await Promise.all([
        User.findById(actor.userId).select('name').lean<{ name?: string }>(),
        User.findById(previousSupervisorId).select('name').lean<{ name?: string }>(),
      ]);
      after(() => notifyNewSupervisor(group, actorUser?.name || 'The capstone coordinator', previous?.name));
    }
    // Removing a member can complete (or un-complete) the group's journal.
    if (typeof body?.removeMemberStudentAccountId === 'string') await syncJournalCompletion(group._id, { schedule: after, group });
    return NextResponse.json(group);
  } catch (error: any) {
    console.error('PATCH /api/capstone/groups/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update group' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    if (!(await canManageGroup(actor, group))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await deleteGroupCascade(id);
    if (!result.deleted) {
      const reason = 'reason' in result ? result.reason : 'unknown';
      return NextResponse.json({ error: `Cannot delete: ${reason}` }, { status: 409 });
    }

    return NextResponse.json({ message: 'Group deleted' });
  } catch (error) {
    console.error('DELETE /api/capstone/groups/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 });
  }
}
