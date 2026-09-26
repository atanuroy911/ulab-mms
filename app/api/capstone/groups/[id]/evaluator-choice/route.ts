import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup, { CHOOSABLE_COMPONENTS } from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import GradingScheme from '@/models/GradingScheme';
import { getCapstoneActor, canManageDepartment, isGroupGrader } from '@/lib/capstoneAuth';
import { computeSessionGrades, type EvaluatorChoiceOverride, type GroupGrades } from '@/lib/capstoneGrades';
import { markingPlanForSession } from '@/lib/capstoneMarkingPlan';

type Choosable = (typeof CHOOSABLE_COMPONENTS)[number];

/**
 * POST /api/capstone/groups/[id]/evaluator-choice
 *
 * What the coordinator needs to decide whose evaluator marks count (Manage tab, step 2):
 * every evaluator's presentation and report marks, which of them count, the grading-scheme
 * blocks that read them, and each student's grade - as saved, and (with `rules` in the body)
 * as it would be under an unsaved choice. Read-only: saving goes through PATCH on the group.
 *
 * Body (optional): { rules: { presentation?: { chosen?, how?, topK? }, report?: {...} } }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    const session = await CapstoneSession.findById(group.sessionId);
    if (!session || !canManageDepartment(actor, session.department)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Only the pieces a preview may change, validated loosely - nothing here is saved.
    const rules: EvaluatorChoiceOverride['rules'] = {};
    for (const c of CHOOSABLE_COMPONENTS) {
      const r = body?.rules?.[c];
      if (!r || typeof r !== 'object') continue;
      rules[c] = {
        ...(Array.isArray(r.chosen) ? { chosen: r.chosen.map(String) } : {}),
        ...(r.how === 'mean' || r.how === 'max' ? { how: r.how } : {}),
        ...('topK' in r ? { topK: Number.isInteger(r.topK) && r.topK > 0 ? r.topK : null } : {}),
      };
    }
    const previewing = Object.keys(rules).length > 0;

    const filter = { _id: group._id };
    const [now, preview, plan] = await Promise.all([
      computeSessionGrades(session, filter),
      previewing ? computeSessionGrades(session, filter, { groupId: String(group._id), rules }) : null,
      markingPlanForSession(session, group.track),
    ]);
    const current = now.groups[0];
    const next = (preview?.groups[0] ?? current) as GroupGrades | undefined;
    if (!current || !next) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    // The scheme blocks that read each component - so the screen can say where the choice goes.
    const pinned = session.tracks.find((t) => t.track === group.track);
    const scheme = pinned?.gradingSchemeId ? await GradingScheme.findById(pinned.gradingSchemeId).lean() : null;
    const version = scheme?.versions?.find((v) => v.version === pinned?.gradingSchemeVersion);
    const nodes = version?.nodes ?? scheme?.nodes ?? [];
    const blocksFor = (c: Choosable) =>
      nodes
        .filter((n) => n.type === 'source' && n.data?.component === c)
        .map((n) => ({ label: String(n.data?.label || c), scope: String(n.data?.scope || ''), aggregate: String(n.data?.aggregate || 'mean') }));

    const activeIds = group.evaluators.filter((e) => !e.unassignedAt).map((e) => String(e.evaluatorId));
    const nameOf = new Map<string, string>();
    for (const m of current.members) for (const s of m.submissions) nameOf.set(s.submitterId, s.submitterName);

    const combined = (subs: GroupGrades['members'][number]['submissions'], c: Choosable, how: 'mean' | 'max') => {
      const vals = subs.filter((s) => s.component === c && s.submitterRole === 'evaluator' && s.counted).map((s) => s.rawScore);
      if (vals.length === 0) return null;
      return how === 'max' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    return NextResponse.json({
      canChoose: !isGroupGrader(actor, group),
      scheme: scheme ? { name: scheme.name, version: version?.version ?? null } : null,
      evaluators: activeIds.map((eid) => ({ id: eid, name: nameOf.get(eid) || null })),
      components: Object.fromEntries(
        CHOOSABLE_COMPONENTS.map((c) => [
          c,
          {
            max: plan.evaluator.find((r) => r.component === c)?.max ?? null,
            blocks: blocksFor(c),
            saved: current.evaluatorRules[c],
            rule: next.evaluatorRules[c],
            // The saved picked list (only meaningful in "pick" mode).
            picked: (group.chosenEvaluators?.[c] || []).map(String).filter((x) => activeIds.includes(x)),
          },
        ])
      ),
      students: current.members.map((m) => {
        const after = next.members.find((x) => x.studentAccountId === m.studentAccountId) ?? m;
        return {
          id: m.studentAccountId,
          name: m.name,
          studentId: m.studentId,
          now: { score: m.score, letter: m.letter },
          preview: { score: after.score, letter: after.letter },
          // Every evaluator mark, flagged as counted under the previewed (or saved) choice.
          marks: after.submissions
            .filter((s) => s.submitterRole === 'evaluator' && (CHOOSABLE_COMPONENTS as readonly string[]).includes(s.component))
            .map((s) => ({ component: s.component, evaluatorId: s.submitterId, raw: s.rawScore, max: s.rubricMax, counted: s.counted })),
          combined: Object.fromEntries(CHOOSABLE_COMPONENTS.map((c) => [c, combined(after.submissions, c, next.evaluatorRules[c].how)])),
        };
      }),
    });
  } catch (error) {
    console.error('POST /api/capstone/groups/[id]/evaluator-choice error:', error);
    return NextResponse.json({ error: 'Failed to load evaluator marks' }, { status: 500 });
  }
}
