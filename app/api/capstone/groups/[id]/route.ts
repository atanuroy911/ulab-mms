import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup, { CHOOSABLE_COMPONENTS, MAX_CHOSEN_EVALUATORS } from '@/models/CapstoneGroup';
import { getCapstoneActor, canManageGroup, isGroupSupervisor, isGroupGrader } from '@/lib/capstoneAuth';
import { assignableUserError } from '@/lib/webAdminAccount';

const VALID_REMOVE_REASONS = ['dropped', 'transferred', 'withdrawn', 'admin-correction'];
import { deleteGroupCascade } from '@/lib/capstoneCascadeDelete';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const group = await CapstoneGroup.findById(id)
      .populate('supervisorId', 'name email')
      .populate('evaluators.evaluatorId', 'name email')
      .populate('members.studentAccountId', 'studentId name email');
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const canManage = await canManageGroup(actor, group);
    if (!canManage && !isGroupGrader(actor, group)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(group);
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

    // Chosen evaluators — coordinator/admin only. Per component (presentation/report),
    // max 2 each, and each must be an ACTIVE evaluator of this group.
    //
    // Accepts the per-component shape: { chosenEvaluators: { presentation: [...], report: [...] } }.
    // A component that is omitted is left untouched, so the UI can save one panel at a time
    // without clobbering the other.
    if (body?.chosenEvaluators && typeof body.chosenEvaluators === 'object') {
      if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

        if (chosen.length > MAX_CHOSEN_EVALUATORS) {
          return NextResponse.json(
            {
              error: `You may select at most ${MAX_CHOSEN_EVALUATORS} evaluators whose ${component} marks count`,
            },
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

    await group.save();
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
