import mongoose from 'mongoose';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import StudentAccount from '@/models/StudentAccount';
import '@/models/Semester';
import { computeSessionGrades } from '@/lib/capstoneGrades';
import { NEXT_TRACK, defaultDecision, type Decision, type DecisionReason } from '@/lib/capstoneProgression';

/**
 * Moving graded groups on to the next session (rules in lib/capstoneProgression.ts).
 *
 * The plan is read-only. The move creates each continuing group in the next session's next
 * track - same title and supervisor, only the students who move, linked back through
 * previousGroupId - and records on the old group where it went and who stayed and why. A
 * group is claimed atomically before anything is created, so it can never be moved twice.
 * Nothing about the old session's marks or grades changes.
 */

export const MOVABLE_FROM: string[] = ['closed'];
export const MOVABLE_TO: string[] = ['draft', 'open'];

export interface PlanMember {
  studentAccountId: string;
  studentId: string;
  name: string;
  score: number | null;
  letter: string | null;
  missingComponents: string[];
  removed: boolean;
  decision: Decision;
  reason: DecisionReason;
}

export interface PlanGroup {
  groupId: string;
  track: string;
  nextTrack: string | null;
  groupNumber: number;
  projectTitle: string;
  supervisorName: string | null;
  alreadyMoved: { targetSessionLabel: string; targetGroupId: string | null; movedAt: string } | null;
  members: PlanMember[];
}

const sessionLabel = (s: { department: string; semesterId?: unknown }) => {
  const sem = s.semesterId && typeof s.semesterId === 'object' ? (s.semesterId as { name?: string }).name : '';
  return `${s.department} Capstone${sem ? ` · ${sem}` : ''}`;
};

export async function buildProgressionPlan(sessionId: string) {
  const session = await CapstoneSession.findById(sessionId).populate('semesterId', 'name');
  if (!session) return null;

  const [grades, groups, targets] = await Promise.all([
    computeSessionGrades(session),
    CapstoneGroup.find({ sessionId }).sort({ track: 1, groupNumber: 1 }).lean(),
    CapstoneSession.find({ department: session.department, _id: { $ne: session._id }, status: { $in: MOVABLE_TO } })
      .populate('semesterId', 'name')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  // Withdrawn members were removed from the group, so the grade calculation skips them - but
  // the coordinator should still see them here, marked W.
  const withdrawnIds = groups.flatMap((g) => g.members.filter((m) => m.removedAt && m.removedReason === 'withdrawn').map((m) => m.studentAccountId));
  const [withdrawnAccounts, targetSessions, targetGroupCounts] = await Promise.all([
    StudentAccount.find({ _id: { $in: withdrawnIds } }).select('studentId name').lean(),
    CapstoneSession.find({ _id: { $in: groups.map((g) => g.progression?.targetSessionId).filter(Boolean) } }).populate('semesterId', 'name').lean(),
    CapstoneGroup.aggregate([{ $match: { sessionId: { $in: targets.map((t) => t._id) } } }, { $group: { _id: '$sessionId', n: { $sum: 1 } } }]),
  ]);
  const withdrawnById = new Map(withdrawnAccounts.map((a) => [String(a._id), a]));
  const targetLabel = new Map(targetSessions.map((t) => [String(t._id), sessionLabel(t)]));
  const gradedById = new Map(grades.groups.map((g) => [g.groupId, g]));
  const countBySession = new Map(targetGroupCounts.map((c) => [String(c._id), c.n as number]));

  const planGroups: PlanGroup[] = groups.map((g) => {
    const graded = gradedById.get(String(g._id));
    const active: PlanMember[] = (graded?.members || []).map((m) => {
      const d = defaultDecision({ letter: m.letter, score: m.score, missingComponents: m.missingComponents }, g.track);
      return {
        studentAccountId: m.studentAccountId,
        studentId: m.studentId,
        name: m.name || '',
        score: m.score,
        letter: m.letter,
        missingComponents: m.missingComponents,
        removed: false,
        ...d,
      };
    });
    const withdrawn: PlanMember[] = g.members
      .filter((m) => m.removedAt && m.removedReason === 'withdrawn')
      .map((m) => {
        const acc = withdrawnById.get(String(m.studentAccountId));
        return {
          studentAccountId: String(m.studentAccountId),
          studentId: acc?.studentId || m.studentIdText,
          name: acc?.name || '',
          score: null,
          letter: 'W',
          missingComponents: [],
          removed: true,
          decision: 'withdrawn',
          reason: 'withdrawn',
        };
      });
    return {
      groupId: String(g._id),
      track: g.track,
      nextTrack: NEXT_TRACK[g.track] ?? null,
      groupNumber: g.groupNumber,
      projectTitle: g.projectTitle,
      supervisorName: graded?.supervisorName ?? null,
      alreadyMoved: g.progression
        ? {
            targetSessionLabel: targetLabel.get(String(g.progression.targetSessionId)) || 'another session',
            targetGroupId: g.progression.targetGroupId ? String(g.progression.targetGroupId) : null,
            movedAt: new Date(g.progression.movedAt).toISOString(),
          }
        : null,
      members: [...active, ...withdrawn],
    };
  });

  return {
    session: { id: String(session._id), department: session.department, label: sessionLabel(session), status: session.status },
    canMove: MOVABLE_FROM.includes(session.status),
    targets: targets.map((t) => ({
      id: String(t._id),
      label: sessionLabel(t),
      status: t.status,
      tracks: (t.tracks || []).map((x) => x.track),
      groupCount: countBySession.get(String(t._id)) || 0,
    })),
    groups: planGroups,
  };
}

export interface MoveResult {
  moved: Array<{ sourceGroupId: string; targetGroupId: string; track: string; groupNumber: number; students: number }>;
  stayed: Array<{ sourceGroupId: string; students: number }>;
  skipped: Array<{ sourceGroupId: string; reason: string }>;
}

/**
 * Moves the groups. `decisions[groupId][studentAccountId]` overrides the default for any
 * student; anyone not mentioned keeps their default. Only groups in `groupIds` are touched.
 */
export async function moveGroups(params: {
  sourceSessionId: string;
  targetSessionId: string;
  groupIds: string[];
  decisions: Record<string, Record<string, Decision>>;
  actorId: string | null;
}): Promise<MoveResult | { error: string; status: number }> {
  const { sourceSessionId, targetSessionId, groupIds, decisions, actorId } = params;
  const [source, target] = await Promise.all([CapstoneSession.findById(sourceSessionId), CapstoneSession.findById(targetSessionId)]);
  if (!source || !target) return { error: 'Session not found', status: 404 };
  if (String(source._id) === String(target._id)) return { error: 'Choose a different session to move to', status: 400 };
  if (!MOVABLE_FROM.includes(source.status)) return { error: 'Finish the session (publish its results) before moving groups on', status: 409 };
  if (!MOVABLE_TO.includes(target.status)) return { error: 'The next session must still be being set up or running', status: 409 };
  if (target.department !== source.department) return { error: 'The next session must be in the same department', status: 400 };

  const plan = await buildProgressionPlan(sourceSessionId);
  if (!plan) return { error: 'Session not found', status: 404 };
  const targetTracks = new Set((target.tracks || []).map((t) => t.track));
  const result: MoveResult = { moved: [], stayed: [], skipped: [] };

  for (const g of plan.groups.filter((x) => groupIds.includes(x.groupId))) {
    if (g.alreadyMoved) {
      result.skipped.push({ sourceGroupId: g.groupId, reason: 'Already moved' });
      continue;
    }
    if (!g.nextTrack) {
      result.skipped.push({ sourceGroupId: g.groupId, reason: 'Track C has completed the capstone' });
      continue;
    }
    const chosen = decisions[g.groupId] || {};
    const final = g.members.map((m) => ({
      ...m,
      // A withdrawn (removed) student can't be moved back in from here.
      decision: m.removed ? ('withdrawn' as Decision) : chosen[m.studentAccountId] || m.decision,
    }));
    const moving = final.filter((m) => m.decision === 'move');
    const stayed = final
      .filter((m) => m.decision !== 'move')
      .map((m) => ({
        studentAccountId: new mongoose.Types.ObjectId(m.studentAccountId),
        decision: m.decision as 'hold' | 'withdrawn',
        reason: chosen[m.studentAccountId] && chosen[m.studentAccountId] !== m.decision ? 'coordinator' : m.reason,
      }));

    if (moving.length > 0 && !targetTracks.has(g.nextTrack as 'A' | 'B' | 'C')) {
      result.skipped.push({ sourceGroupId: g.groupId, reason: `The next session doesn't run Track ${g.nextTrack}` });
      continue;
    }
    if (moving.length > 0) {
      const clash = await CapstoneGroup.findOne({
        sessionId: target._id,
        members: { $elemMatch: { studentAccountId: { $in: moving.map((m) => m.studentAccountId) }, removedAt: null } },
      }).select('track groupNumber members');
      if (clash) {
        const clashIds = new Set(clash.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId)));
        const who = moving.filter((m) => clashIds.has(m.studentAccountId)).map((m) => m.studentId).join(', ');
        result.skipped.push({ sourceGroupId: g.groupId, reason: `${who} already in Track ${clash.track} #${clash.groupNumber} of the next session` });
        continue;
      }
    }

    // Claim the group before creating anything: a second click or a second coordinator
    // finds progression already set and moves nothing.
    const claimed = await CapstoneGroup.findOneAndUpdate(
      { _id: g.groupId, sessionId: source._id, progression: null },
      { $set: { progression: { targetSessionId: target._id, targetGroupId: null, movedAt: new Date(), movedBy: actorId, stayed } } },
      { new: true }
    );
    if (!claimed) {
      result.skipped.push({ sourceGroupId: g.groupId, reason: 'Already moved' });
      continue;
    }
    if (moving.length === 0) {
      result.stayed.push({ sourceGroupId: g.groupId, students: final.length });
      continue;
    }

    try {
      // Keep the group's number when it's free in the next track; otherwise the next one.
      let created = null;
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        const taken = await CapstoneGroup.exists({ sessionId: target._id, track: g.nextTrack, groupNumber: g.groupNumber });
        const last = await CapstoneGroup.findOne({ sessionId: target._id, track: g.nextTrack }).sort({ groupNumber: -1 }).select('groupNumber');
        const groupNumber = attempt === 0 && !taken ? g.groupNumber : (last?.groupNumber || 0) + 1;
        try {
          created = await CapstoneGroup.create({
            sessionId: target._id,
            track: g.nextTrack,
            groupNumber,
            projectTitle: claimed.projectTitle,
            supervisorId: claimed.supervisorId,
            members: moving.map((m) => ({ studentAccountId: m.studentAccountId, studentIdText: m.studentId, joinedAt: new Date(), role: 'member' })),
            evaluators: [],
            previousGroupId: claimed._id,
            createdBy: actorId,
          });
        } catch (err) {
          if ((err as { code?: number })?.code !== 11000) throw err;
        }
      }
      if (!created) throw new Error('Could not find a free group number');
      await CapstoneGroup.updateOne({ _id: claimed._id }, { $set: { 'progression.targetGroupId': created._id } });
      result.moved.push({ sourceGroupId: g.groupId, targetGroupId: String(created._id), track: created.track, groupNumber: created.groupNumber, students: moving.length });
    } catch (err) {
      // Release the claim so the group can be moved again once the problem is fixed.
      await CapstoneGroup.updateOne({ _id: claimed._id }, { $set: { progression: null } });
      result.skipped.push({ sourceGroupId: g.groupId, reason: err instanceof Error ? err.message : 'Could not create the new group' });
    }
  }
  return result;
}
