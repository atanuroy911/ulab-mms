import { NextRequest, NextResponse, after } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import { isRunning } from '@/lib/capstoneStatus';
import CapstoneMarkSubmission, { CapstoneMarkComponent } from '@/models/CapstoneMarkSubmission';
import { getCapstoneActor, isGroupGrader, isGroupSupervisor, canManageGroup } from '@/lib/capstoneAuth';
import { REPORT_RUBRICS } from '@/lib/capstoneRubrics';
import { getMarkingPlan } from '@/lib/capstoneMarkingPlan';
import { GRADING_COMPONENTS } from '@/lib/gradingEngine';
import { syncJournalCompletion } from '@/lib/capstoneJournalWorkflow';

// Scales and "who marks what" come from the track's grading scheme (lib/capstoneMarkingPlan.ts),
// falling back to the department default (report 33/42, presentation 45, peer 5, journal 10).

const PRESENTATION_CRITERIA_COUNT = 5;
const PRESENTATION_LEVELS = [0, 3, 6, 9];

// GET: the signed-in grader's own submissions for this group (never another grader's -
// see docs/capstone-marking-and-rubrics.md's anchoring-bias note: an evaluator must not see
// the supervisor's score, or another evaluator's, before submitting their own).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const requestedSubmitter = request.nextUrl.searchParams.get('submitterId');
    // The common case - a grader's own marks - is fetched alongside the group (one round trip
    // instead of two) and only returned after the permission check below.
    const [group, ownMarks] = await Promise.all([
      CapstoneGroup.findById(id),
      requestedSubmitter ? null : CapstoneMarkSubmission.find({ groupId: id, submitterId: actor.userId }),
    ]);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    // ?submitterId=<grader>: a coordinator loading one grader's marks to enter or correct them
    // from the paper sheets. Coordinators don't grade, so there's no anchoring concern.
    if (requestedSubmitter) {
      if (!(await canManageGroup(actor, group))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const submissions = await CapstoneMarkSubmission.find({ groupId: id, submitterId: requestedSubmitter });
      return NextResponse.json(submissions);
    }

    if (!isGroupGrader(actor, group)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(ownMarks);
  } catch (error) {
    console.error('GET /api/capstone/groups/[id]/marks error:', error);
    return NextResponse.json({ error: 'Failed to fetch marks' }, { status: 500 });
  }
}

// POST: bulk-submit one component's marks for every member. Body:
// { component, marks: [{ studentAccountId, rawScore, comment? }], onBehalfOf? }
//
// `onBehalfOf` (coordinators/admins only): records the marks as that
// grader's - their supervisor or evaluator mark, counted exactly as if they had typed it -
// with `enteredBy` noting who actually entered it. Used to copy paper marking sheets in.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const component = body?.component as CapstoneMarkComponent;
    const marks: Array<{ studentAccountId: string; rawScore: number; comment?: string; rubricScores?: Record<string, number> | null }> = Array.isArray(body?.marks)
      ? body.marks
      : [];

    if (!component || !GRADING_COMPONENTS.includes(component)) {
      return NextResponse.json({ error: 'A valid component is required' }, { status: 400 });
    }
    if (marks.length === 0) {
      return NextResponse.json({ error: 'marks is required' }, { status: 400 });
    }

    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const onBehalfOf = typeof body?.onBehalfOf === 'string' && body.onBehalfOf ? body.onBehalfOf : null;
    let submitterId = actor.userId;
    let supervisor: boolean;
    if (onBehalfOf) {
      if (!(await canManageGroup(actor, group))) {
        return NextResponse.json({ error: 'Only a coordinator can enter marks for another grader' }, { status: 403 });
      }
      const isSupervisorTarget = String(group.supervisorId) === onBehalfOf;
      const isEvaluatorTarget = group.evaluators.some((e) => !e.unassignedAt && String(e.evaluatorId) === onBehalfOf);
      if (!isSupervisorTarget && !isEvaluatorTarget) {
        return NextResponse.json({ error: "That person isn't this group's supervisor or an active evaluator" }, { status: 400 });
      }
      submitterId = onBehalfOf;
      supervisor = isSupervisorTarget;
    } else {
      if (!isGroupGrader(actor, group)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      supervisor = isGroupSupervisor(actor, group);
    }

    // Marks can be given (and paper sheets entered) while the session is Running; once it is
    // Finished the results are published and marks are read-only.
    const capstoneSession = await CapstoneSession.findById(group.sessionId).select('status');
    if (!capstoneSession || !isRunning(capstoneSession.status)) {
      return NextResponse.json({ error: 'Marks can only be given while the session is running' }, { status: 409 });
    }

    // Who marks what comes from the track's active grading scheme: a supervisor gives only
    // the components the scheme reads from the supervisor, evaluators only theirs.
    const submitterRole = supervisor ? 'supervisor' : 'evaluator';
    const plan = await getMarkingPlan(group.sessionId, group.track);
    const requirement = plan[submitterRole].find((r) => r.component === component);
    if (!requirement) {
      return NextResponse.json(
        { error: `The grading scheme for this track doesn't take ${component} marks from the ${submitterRole}` },
        { status: 403 }
      );
    }

    const activeMemberIds = new Set(
      group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId))
    );
    const max = requirement.max;

    const saved = [];
    // Marks that can't be recorded are reported back rather than skipped silently, so the
    // page never says "saved" about a mark it didn't keep.
    const rejected: Array<{ studentAccountId: string; reason: string }> = [];
    for (const entry of marks) {
      const studentAccountId = String(entry.studentAccountId || '');
      // `Number(null)` and `Number('')` are both 0, which would silently turn "not graded yet"
      // into a real, submitted zero. Only accept an actual number/numeric-string the client
      // sent - reject null/undefined/empty explicitly rather than coercing them.
      if (entry.rawScore === null || entry.rawScore === undefined || entry.rawScore === ('' as any)) continue;
      const rawScore = Number(entry.rawScore);

      if (!activeMemberIds.has(studentAccountId)) {
        rejected.push({ studentAccountId, reason: 'no longer in this group' });
        continue;
      }
      if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > max) {
        rejected.push({ studentAccountId, reason: `must be between 0 and ${max}` });
        continue;
      }

      // Presentation is scored per student on 5 criteria at 0/3/6/9. Reject a total that
      // doesn't match its own rubric, so a tampered or stale payload can't record a score
      // no evaluator actually gave.
      if (component === 'presentation' && entry.rubricScores) {
        const values = Object.values(entry.rubricScores);
        const valid =
          values.length === PRESENTATION_CRITERIA_COUNT &&
          values.every((v) => PRESENTATION_LEVELS.includes(Number(v))) &&
          values.reduce((a, b) => a + Number(b), 0) === rawScore;
        if (!valid) {
          rejected.push({ studentAccountId, reason: "doesn't match its rubric scores" });
          continue;
        }
      }
      // Same check for the report rubric: one 0-3 score per criterion of this track's rubric.
      if (component === 'report' && entry.rubricScores) {
        const values = Object.values(entry.rubricScores);
        const criteriaCount = (REPORT_RUBRICS[group.track as 'A' | 'B' | 'C'] || REPORT_RUBRICS.B).length;
        const valid =
          values.length === criteriaCount &&
          values.every((v) => [0, 1, 2, 3].includes(Number(v))) &&
          values.reduce((a, b) => a + Number(b), 0) === rawScore;
        if (!valid) {
          rejected.push({ studentAccountId, reason: "doesn't match its rubric scores" });
          continue;
        }
      }

      const doc = await CapstoneMarkSubmission.findOneAndUpdate(
        {
          sessionId: group.sessionId,
          studentAccountId,
          component,
          submitterId,
        },
        {
          $set: {
            sessionId: group.sessionId,
            track: group.track,
            groupId: group._id,
            studentAccountId,
            component,
            submitterId,
            submitterRole,
            // Who actually typed it: the grader themselves, or the coordinator on their behalf.
            enteredBy: actor.userId,
            rawScore,
            rubricScores: entry.rubricScores || null,
            rubricMax: max,
            comment: entry.comment || '',
            status: 'submitted',
            submittedAt: new Date(),
            lastEditedAt: new Date(),
          },
          $inc: { revisionCount: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved.push(doc);
    }

    // The supervisor's journal marks are the last step of the journal - this may finish it.
    if (saved.some((d) => d.component === 'weeklyJournal')) await syncJournalCompletion(group._id, { schedule: after, group });

    return NextResponse.json({ saved: saved.length, submissions: saved, rejected });
  } catch (error: any) {
    console.error('POST /api/capstone/groups/[id]/marks error:', error);
    return NextResponse.json({ error: error.message || 'Failed to submit marks' }, { status: 500 });
  }
}
