import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import { getCapstoneActor, isAdmin, isCoordinatorFor, isGroupGrader, isGroupSupervisor } from '@/lib/capstoneAuth';
import { computeSessionGrades, redactMemberForGrader } from '@/lib/capstoneGrades';
import { getMarkingPlan, componentsFor } from '@/lib/capstoneMarkingPlan';

/**
 * GET /api/capstone/sessions/[id]/grades
 *
 * Computes final grades by running each track's pinned grading scheme over the marks
 * actually submitted. Read-only - it never writes a grade, so it always reflects the
 * current submissions and is safe to call repeatedly.
 *
 * Optional `?groupId=` narrows to one group.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const session = await CapstoneSession.findById(id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const groupIdFilter = searchParams.get('groupId');

    const canSeeWholeSession = isAdmin(actor) || isCoordinatorFor(actor, session.department);

    // A supervisor/evaluator may only see the groups they actually grade. Rather than
    // filtering after computing, resolve the allowed ids up front and pass them as a query
    // filter, so another group's marks are never even loaded.
    const filter: Record<string, unknown> = {};
    if (groupIdFilter) filter._id = groupIdFilter;

    // Group id -> this grader's role in it, for redacting other graders' marks below.
    const roleByGroup = new Map<string, 'supervisor' | 'evaluator'>();
    if (!canSeeWholeSession) {
      const candidates = await CapstoneGroup.find({ sessionId: id, ...filter }).select(
        'supervisorId evaluators'
      );
      const allowedGroups = candidates.filter((g) => isGroupGrader(actor, g));
      for (const g of allowedGroups) {
        roleByGroup.set(String(g._id), isGroupSupervisor(actor, g) ? 'supervisor' : 'evaluator');
      }
      const allowed = allowedGroups.map((g) => g._id);
      if (allowed.length === 0) {
        return NextResponse.json({ sessionId: id, canSeeWholeSession, tracks: [], groups: [] });
      }
      filter._id = { $in: allowed };
    }

    const computed = await computeSessionGrades(session, filter);
    const tracks = computed.tracks;
    // Graders see another grader's marks only after submitting their own (anchoring).
    // What each grader owes comes from the track's active scheme (one plan per track).
    const planByTrack = new Map<string, Awaited<ReturnType<typeof getMarkingPlan>>>();
    if (!canSeeWholeSession) {
      for (const track of new Set(computed.groups.map((g) => g.track))) {
        planByTrack.set(track, await getMarkingPlan(id, track));
      }
    }
    const groups = canSeeWholeSession
      ? computed.groups
      : computed.groups.map((g) => {
          const role = roleByGroup.get(g.groupId) || 'evaluator';
          const plan = planByTrack.get(g.track);
          return {
            ...g,
            members: g.members.map((m) => redactMemberForGrader(m, actor.userId, plan ? componentsFor(plan, role) : role)),
          };
        });

    return NextResponse.json({
      sessionId: id,
      department: session.department,
      canSeeWholeSession,
      tracks,
      groups,
    });
  } catch (error: unknown) {
    console.error('GET /api/capstone/sessions/[id]/grades error:', error);
    return NextResponse.json({ error: 'Failed to compute grades' }, { status: 500 });
  }
}
