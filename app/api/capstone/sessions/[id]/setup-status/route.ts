import { NextRequest, NextResponse } from 'next/server';
import { MIN_CHOSEN_EVALUATORS } from '@/models/CapstoneGroup';
import dbConnect from '@/lib/mongodb';
import { statusLabel } from '@/lib/capstoneStatus';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import GradingScheme from '@/models/GradingScheme';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';

/**
 * GET /api/capstone/sessions/[id]/setup-status
 *
 * Drives the session's setup checklist: what is done, what is next, and what is blocked.
 *
 * Running a capstone semester is a long ordered process - publish a scheme, pin it, add
 * groups, assign evaluators, open the session, collect marks, narrow the evaluator panel,
 * export. Coordinators do it twice a year, so there is no way they remember the order.
 * Computing the state server-side (rather than scattering the rules through the UI) keeps
 * one definition of "what should happen next".
 */

export type StepState = 'done' | 'current' | 'todo' | 'blocked';

export interface SetupStep {
  key: string;
  title: string;
  description: string;
  state: StepState;
  /** Short status line, e.g. "3 of 4 groups". */
  detail?: string;
  /** Where to go to act on this step. */
  href?: string;
  /** Names the thing that must happen first, for a blocked step. */
  blockedBy?: string;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const session = await CapstoneSession.findById(id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canManageDepartment(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [groups, schemes, submissionCount] = await Promise.all([
      CapstoneGroup.find({ sessionId: id }).select('track groupNumber evaluators chosenEvaluators evaluatorTopK members'),
      GradingScheme.find({ department: session.department, isArchived: false }).select('name currentVersion'),
      CapstoneMarkSubmission.countDocuments({ sessionId: id, status: 'submitted' }),
    ]);

    const publishedSchemes = schemes.filter((s) => s.currentVersion > 0);
    const pinnedTracks = session.tracks.filter((t) => t.gradingSchemeId && t.gradingSchemeVersion);
    const unpinnedTracks = session.tracks.filter((t) => !t.gradingSchemeId || !t.gradingSchemeVersion);

    const activeGroups = groups.filter((g) => g.members.some((m) => !m.removedAt));
    const groupsWithoutEvaluators = groups.filter(
      (g) => g.evaluators.filter((e) => !e.unassignedAt).length === 0
    );

    // "Needs a choice" only counts groups with more than two evaluators - with one or two,
    // all of them count automatically (countedEvaluators in models/CapstoneGroup.ts).
    const groupsNeedingChoice = groups.filter((g) => {
      const active = g.evaluators.filter((e) => !e.unassignedAt).length;
      if (active <= MIN_CHOSEN_EVALUATORS) return false;
      // Top K is a decision too.
      const decided = (c: 'report' | 'presentation' | 'poster') => (g.chosenEvaluators?.[c]?.length || 0) > 0 || !!g.evaluatorTopK?.[c];
      // Track C (4098C) also has a poster panel.
      return !decided('report') || !decided('presentation') || (g.track === 'C' && !decided('poster'));
    });

    const status = session.status;
    const steps: SetupStep[] = [];

    // ── 1. Grading scheme ──────────────────────────────────────────────────────────────
    steps.push({
      key: 'scheme',
      title: 'Publish a grading scheme',
      description:
        'Define how report, presentation, peer and journal marks combine into a final grade.',
      state: publishedSchemes.length > 0 ? 'done' : 'current',
      detail:
        publishedSchemes.length > 0
          ? `${publishedSchemes.length} published for ${session.department}`
          : schemes.length > 0
            ? `${schemes.length} draft${schemes.length === 1 ? '' : 's'} — none published yet`
            : 'None yet',
      href: '/capstone/grading-schemes',
    });

    // ── 2. Pin per track ───────────────────────────────────────────────────────────────
    steps.push({
      key: 'pin',
      title: 'Pin a scheme to each track',
      description: 'Each track grades under the published version you pin to it.',
      state:
        publishedSchemes.length === 0
          ? 'blocked'
          : unpinnedTracks.length === 0
            ? 'done'
            : 'current',
      detail:
        unpinnedTracks.length === 0
          ? `All ${session.tracks.length} tracks pinned`
          : `${pinnedTracks.length} of ${session.tracks.length} pinned · missing ${unpinnedTracks
              .map((t) => t.track)
              .join(', ')}`,
      blockedBy: publishedSchemes.length === 0 ? 'Publish a grading scheme first' : undefined,
    });

    // ── 3. Groups ──────────────────────────────────────────────────────────────────────
    steps.push({
      key: 'groups',
      title: 'Add groups',
      description: 'Each group needs a project title, a supervisor, and its student members.',
      state: activeGroups.length > 0 ? 'done' : 'current',
      detail:
        activeGroups.length > 0
          ? `${activeGroups.length} group${activeGroups.length === 1 ? '' : 's'}`
          : 'None yet',
    });

    // ── 4. Evaluators ──────────────────────────────────────────────────────────────────
    steps.push({
      key: 'evaluators',
      title: 'Assign evaluators',
      description: 'Evaluators grade the presentation and the report alongside the supervisor.',
      state:
        groups.length === 0
          ? 'blocked'
          : groupsWithoutEvaluators.length === 0
            ? 'done'
            : 'current',
      detail:
        groups.length === 0
          ? undefined
          : groupsWithoutEvaluators.length === 0
            ? 'Every group has at least one'
            : `${groupsWithoutEvaluators.length} group${groupsWithoutEvaluators.length === 1 ? '' : 's'} with none`,
      blockedBy: groups.length === 0 ? 'Add groups first' : undefined,
    });

    // ── 5. Open the session ────────────────────────────────────────────────────────────
    steps.push({
      key: 'open',
      title: 'Open the session',
      description:
        'Students can then set their project title and submit weekly journals; supervisors can comment.',
      state:
        status === 'draft'
          ? activeGroups.length > 0
            ? 'current'
            : 'blocked'
          : 'done',
      detail: status === 'draft' ? 'Still being set up' : `Status: ${statusLabel(status)}`,
      blockedBy: status === 'draft' && activeGroups.length === 0 ? 'Add groups first' : undefined,
    });

    // ── 6. Collect marks ───────────────────────────────────────────────────────────────
    steps.push({
      key: 'marks',
      title: 'Collect marks',
      description:
        "Graders submit online (email them a reminder), or enter their paper sheets - in the Enter marks table or each group's Manage tab.",
      state: status === 'draft' ? 'blocked' : submissionCount > 0 ? 'done' : 'current',
      detail: `${submissionCount} mark${submissionCount === 1 ? '' : 's'} submitted`,
      blockedBy: status === 'draft' ? 'Open the session first' : undefined,
    });

    // ── 7. Choose which evaluators count ─────────────────────────────────────────────────
    steps.push({
      key: 'chosen',
      title: 'Choose which evaluators count',
      description:
        "Once the marks are in, pick in each group's Manage tab whose marks count - separately for presentation and report. With none picked, every assigned evaluator counts (averaged, as in the department's workbook). A coordinator who grades a group can't choose for it.",
      // Optional since every evaluator counts by default - never blocks progress.
      state: groups.length === 0 ? 'blocked' : 'done',
      detail:
        groups.length === 0
          ? undefined
          : groupsNeedingChoice.length === 0
            ? 'Nothing to narrow'
            : `All evaluators count · ${groupsNeedingChoice.length} group${groupsNeedingChoice.length === 1 ? '' : 's'} could be narrowed`,
      blockedBy: groups.length === 0 ? 'Add groups first' : undefined,
    });

    // ── 8. Grades ──────────────────────────────────────────────────────────────────────
    steps.push({
      key: 'grades',
      title: 'Review & export grades',
      description: 'Check the computed totals, then download the gradebook as Excel.',
      state:
        submissionCount === 0
          ? 'blocked'
          : unpinnedTracks.length > 0
            ? 'blocked'
            : 'current',
      href: `/capstone/sessions/${id}/grades`,
      blockedBy:
        submissionCount === 0
          ? 'No marks submitted yet'
          : unpinnedTracks.length > 0
            ? 'Pin a grading scheme to every track first'
            : undefined,
    });

    const done = steps.filter((s) => s.state === 'done').length;
    const nextStep = steps.find((s) => s.state === 'current') || null;

    return NextResponse.json({
      sessionId: id,
      department: session.department,
      status,
      steps,
      done,
      total: steps.length,
      nextStepKey: nextStep?.key ?? null,
      groupsNeedingChoice: groupsNeedingChoice.map((g) => ({
        groupId: String(g._id),
        track: g.track,
        groupNumber: g.groupNumber,
      })),
      groupsWithoutEvaluators: groupsWithoutEvaluators.map((g) => ({
        groupId: String(g._id),
        track: g.track,
        groupNumber: g.groupNumber,
      })),
    });
  } catch (error: unknown) {
    console.error('GET /api/capstone/sessions/[id]/setup-status error:', error);
    return NextResponse.json({ error: 'Failed to compute setup status' }, { status: 500 });
  }
}
