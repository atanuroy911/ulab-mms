import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneMarkSubmission, { CapstoneMarkComponent } from '@/models/CapstoneMarkSubmission';
import { getCapstoneActor, isGroupGrader, isGroupSupervisor } from '@/lib/capstoneAuth';

// Per-component ceilings, matching the source spreadsheets/docs - see
// docs/capstone-marking-and-rubrics.md. No blanket max:100 (the old bug).
// Report: 33 for 4098A (Track A), 42 for 4098B/C. Presentation: 45 for all.
const COMPONENT_MAX_BY_TRACK: Record<string, Record<string, number>> = {
  A: { weeklyJournal: 10, peer: 5, report: 33, presentation: 45, poster: 100 },
  B: { weeklyJournal: 10, peer: 5, report: 42, presentation: 45, poster: 100 },
  C: { weeklyJournal: 10, peer: 5, report: 42, presentation: 45, poster: 100 },
};
// Fallback for unknown tracks
const COMPONENT_MAX_DEFAULT: Record<string, number> = {
  weeklyJournal: 10, peer: 5, report: 42, presentation: 45, poster: 100,
};

// weeklyJournal and peer are supervisor-only (the spreadsheet has no evaluator column for
// either); report/presentation/poster can come from either role.
const SUPERVISOR_ONLY_COMPONENTS: CapstoneMarkComponent[] = ['weeklyJournal', 'peer'];

// GET: the signed-in grader's own submissions for this group (never another grader's -
// see docs/capstone-marking-and-rubrics.md's anchoring-bias note: an evaluator must not see
// the supervisor's score, or another evaluator's, before submitting their own).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!isGroupGrader(actor, group)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const submissions = await CapstoneMarkSubmission.find({ groupId: id, submitterId: actor.userId });
    return NextResponse.json(submissions);
  } catch (error) {
    console.error('GET /api/capstone/groups/[id]/marks error:', error);
    return NextResponse.json({ error: 'Failed to fetch marks' }, { status: 500 });
  }
}

// POST: bulk-submit one component's marks for every member. Body:
// { component, marks: [{ studentAccountId, rawScore, comment? }] }
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

    if (!component || !(component in COMPONENT_MAX_DEFAULT)) {
      return NextResponse.json({ error: 'A valid component is required' }, { status: 400 });
    }
    if (marks.length === 0) {
      return NextResponse.json({ error: 'marks is required' }, { status: 400 });
    }

    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!isGroupGrader(actor, group)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Marks must not be writable once the session has moved past 'open' - unlike the
    // journal/title/member-add routes, this route previously never checked session status at
    // all, so grades stayed editable after a session was moved to grading/closed.
    const capstoneSession = await CapstoneSession.findById(group.sessionId).select('status');
    if (!capstoneSession || capstoneSession.status !== 'open') {
      return NextResponse.json({ error: 'Marks can only be submitted while the session is open' }, { status: 409 });
    }

    const supervisor = isGroupSupervisor(actor, group);
    if (SUPERVISOR_ONLY_COMPONENTS.includes(component) && !supervisor) {
      return NextResponse.json({ error: `Only the supervisor submits ${component} marks` }, { status: 403 });
    }

    const activeMemberIds = new Set(
      group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId))
    );
    const max = (COMPONENT_MAX_BY_TRACK[group.track] ?? COMPONENT_MAX_DEFAULT)[component] ?? 100;
    const submitterRole = supervisor ? 'supervisor' : 'evaluator';

    const saved = [];
    for (const entry of marks) {
      const studentAccountId = String(entry.studentAccountId || '');
      // `Number(null)` and `Number('')` are both 0, which would silently turn "not graded yet"
      // into a real, submitted zero. Only accept an actual number/numeric-string the client
      // sent - reject null/undefined/empty explicitly rather than coercing them.
      if (entry.rawScore === null || entry.rawScore === undefined || entry.rawScore === ('' as any)) continue;
      const rawScore = Number(entry.rawScore);

      if (!activeMemberIds.has(studentAccountId)) continue;
      if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > max) continue;

      const doc = await CapstoneMarkSubmission.findOneAndUpdate(
        {
          sessionId: group.sessionId,
          studentAccountId,
          component,
          submitterId: actor.userId,
        },
        {
          $set: {
            sessionId: group.sessionId,
            track: group.track,
            groupId: group._id,
            studentAccountId,
            component,
            submitterId: actor.userId,
            submitterRole,
            rawScore,
            rubricScores: entry.rubricScores || null,
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

    return NextResponse.json({ saved: saved.length, submissions: saved });
  } catch (error: any) {
    console.error('POST /api/capstone/groups/[id]/marks error:', error);
    return NextResponse.json({ error: error.message || 'Failed to submit marks' }, { status: 500 });
  }
}
