import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import User from '@/models/User';
import StudentAccount from '@/models/StudentAccount';
import '@/models/Semester';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { markingPlanForSession, type MarkingPlan } from '@/lib/capstoneMarkingPlan';
import { isRunning } from '@/lib/capstoneStatus';

/**
 * GET /api/capstone/sessions/[id]/marks-entry
 *
 * Everything the coordinator's session-wide mark table needs, in one request: each group's
 * students and graders, what each grader gives (from the track's scheme), whose marks count,
 * and every mark recorded so far. Coordinators/admins only - they don't grade, so there is no
 * anchoring concern in showing every grader's marks. Saving goes through the group marks
 * route with `onBehalfOf`, exactly like entering a paper sheet on the group page.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    await dbConnect();

    const session = await CapstoneSession.findById(id).populate('semesterId', 'name');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canManageDepartment(actor, session.department)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [groups, marks] = await Promise.all([
      CapstoneGroup.find({ sessionId: id }).sort({ track: 1, groupNumber: 1 }).lean(),
      CapstoneMarkSubmission.find({ sessionId: id, status: 'submitted' })
        .select('groupId studentAccountId component submitterId submitterRole rawScore rubricScores enteredBy')
        .lean(),
    ]);

    const userIds = new Set<string>();
    for (const g of groups) {
      userIds.add(String(g.supervisorId));
      for (const e of g.evaluators) userIds.add(String(e.evaluatorId));
    }
    for (const m of marks) userIds.add(String(m.submitterId));
    const studentIds = groups.flatMap((g) => g.members.filter((m) => !m.removedAt).map((m) => m.studentAccountId));

    const tracks = [...new Set(groups.map((g) => g.track))];
    const [users, students, plans] = await Promise.all([
      User.find({ _id: { $in: [...userIds] } }).select('name email').lean(),
      StudentAccount.find({ _id: { $in: studentIds } }).select('studentId name').lean(),
      Promise.all(tracks.map(async (t) => [t, await markingPlanForSession(session, t)] as const)),
    ]);
    const userName = new Map(users.map((u) => [String(u._id), u.name as string]));
    const studentById = new Map(students.map((s) => [String(s._id), s]));
    const planByTrack: Record<string, MarkingPlan> = Object.fromEntries(plans);

    const semester = session.semesterId && typeof session.semesterId === 'object' ? (session.semesterId as unknown as { name?: string }).name : '';

    return NextResponse.json({
      session: {
        id: String(session._id),
        label: `${session.department} Capstone${semester ? ` · ${semester}` : ''}`,
        status: session.status,
        editable: isRunning(session.status),
      },
      plans: planByTrack,
      groups: groups.map((g) => {
        const supervisorId = String(g.supervisorId);
        const active = g.evaluators.filter((e) => !e.unassignedAt).map((e) => String(e.evaluatorId));
        // People who left the group but whose marks are still on record, shown read-only.
        const formerIds = [
          ...new Set(
            marks
              .filter((m) => String(m.groupId) === String(g._id))
              .map((m) => String(m.submitterId))
              .filter((sid) => sid !== supervisorId && !active.includes(sid))
          ),
        ];
        const roleOf = (sid: string) => marks.find((m) => String(m.groupId) === String(g._id) && String(m.submitterId) === sid)?.submitterRole;
        return {
          id: String(g._id),
          track: g.track,
          groupNumber: g.groupNumber,
          projectTitle: g.projectTitle,
          chosenEvaluators: {
            presentation: (g.chosenEvaluators?.presentation || []).map(String),
            report: (g.chosenEvaluators?.report || []).map(String),
          },
          evaluatorTopK: { presentation: g.evaluatorTopK?.presentation ?? null, report: g.evaluatorTopK?.report ?? null },
          students: g.members
            .filter((m) => !m.removedAt)
            .map((m) => {
              const s = studentById.get(String(m.studentAccountId));
              return { id: String(m.studentAccountId), name: s?.name || m.studentIdText, studentId: s?.studentId || m.studentIdText };
            }),
          graders: [
            { id: supervisorId, name: userName.get(supervisorId) || 'Supervisor', role: 'supervisor' as const, current: true },
            ...active.map((eid) => ({ id: eid, name: userName.get(eid) || 'Evaluator', role: 'evaluator' as const, current: true })),
            ...formerIds.map((fid) => ({
              id: fid,
              name: userName.get(fid) || 'Former grader',
              role: (roleOf(fid) || 'evaluator') as 'supervisor' | 'evaluator',
              current: false,
            })),
          ],
        };
      }),
      marks: marks.map((m) => ({
        groupId: String(m.groupId),
        studentId: String(m.studentAccountId),
        component: m.component,
        graderId: String(m.submitterId),
        score: m.rawScore,
        hasRubric: !!m.rubricScores && Object.keys(m.rubricScores).length > 0,
        byCoordinator: !!m.enteredBy && String(m.enteredBy) !== String(m.submitterId),
      })),
    });
  } catch (error) {
    console.error('GET /api/capstone/sessions/[id]/marks-entry error:', error);
    return NextResponse.json({ error: 'Failed to load marks' }, { status: 500 });
  }
}
