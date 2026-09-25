import CapstoneGroup, { countedEvaluators } from '@/models/CapstoneGroup';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import StudentAccount from '@/models/StudentAccount';
import GradingScheme from '@/models/GradingScheme';
import User from '@/models/User';
import { evaluateScheme, validateScheme, componentNodeIds } from '@/lib/gradingEngine';
import type { StudentContext, MarkInput, SchemeGraph, ValidationIssue } from '@/lib/gradingEngine';
import type { CapstoneMarkComponent } from '@/models/CapstoneMarkSubmission';

/**
 * Shared grade computation for a capstone session.
 *
 * Extracted so the JSON endpoint and the Excel export produce provably identical numbers -
 * if the two had their own copies of this, a fix to one would silently leave the other
 * exporting stale arithmetic, and the spreadsheet is the artefact that reaches the
 * department.
 *
 * This only reads. Nothing here writes a grade.
 */

export interface TrackReport {
  track: string;
  schemeId: string | null;
  schemeName?: string;
  version?: number;
  status: 'ok' | 'no-scheme' | 'invalid' | 'unpublished-draft';
  message?: string;
  issues?: ValidationIssue[];
}

export interface MemberGrade {
  studentAccountId: string;
  studentId: string;
  name: string | null;
  email: string | null;
  score: number | null;
  letter: string | null;
  trace: Array<{ nodeId: string; type: string; label: string; value: number; contributingSubmissions?: number }>;
  missingComponents: CapstoneMarkComponent[];
  /** Raw submitted marks, for the detail sheet of the export. */
  submissions: Array<{
    component: CapstoneMarkComponent;
    submitterId: string;
    submitterName: string;
    /** Who typed it, when that wasn't the grader (a coordinator copying a paper sheet). */
    enteredByName?: string | null;
    submitterRole: 'supervisor' | 'evaluator';
    counted: boolean;
    rawScore: number;
    rubricMax: number | null;
    /** Per-criterion scores (c0..cN) when the mark was entered on the rubric; the course file's CO sheets read these. */
    rubricScores?: Record<string, number> | null;
  }>;
  error?: string;
  /**
   * Set by redactMemberForGrader: the components this grader still owes. While non-empty,
   * score/letter/trace are withheld, since the total would reveal other graders' marks.
   */
  gradeHiddenUntil?: CapstoneMarkComponent[];
}

export interface GroupGrades {
  groupId: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  supervisorName: string | null;
  schemeName: string | null;
  schemeVersion: number | null;
  /**
   * Trace node ids that make up this scheme's component columns (see componentNodeIds).
   * The export uses these to build gradebook columns without guessing at node labels.
   */
  componentNodeIds: string[];
  /** How the coordinator combined this group's counted evaluators ('mean' when unset). */
  chosenAggregate: { report?: 'mean' | 'max'; presentation?: 'mean' | 'max' };
  members: MemberGrade[];
}

export interface SessionGrades {
  tracks: TrackReport[];
  groups: GroupGrades[];
}

interface SessionLike {
  _id: unknown;
  department: string;
  tracks: Array<{
    track: string;
    gradingSchemeId?: unknown;
    gradingSchemeVersion?: number | null;
  }>;
}

/**
 * @param groupFilter restricts which groups are computed. Callers use it to enforce that a
 *   supervisor only ever sees groups they actually grade - this function does no
 *   authorisation of its own.
 */
export async function computeSessionGrades(
  session: SessionLike,
  groupFilter: Record<string, unknown> = {}
): Promise<SessionGrades> {
  const sessionId = String(session._id);

  const groups = await CapstoneGroup.find({ sessionId, ...groupFilter }).sort({
    track: 1,
    groupNumber: 1,
  });

  if (groups.length === 0) {
    return { tracks: [], groups: [] };
  }

  // Resolve each track's pinned scheme once, not per student.
  const schemeIds = [
    ...new Set(
      session.tracks.filter((t) => t.gradingSchemeId).map((t) => String(t.gradingSchemeId))
    ),
  ];
  const schemes = schemeIds.length
    ? await GradingScheme.find({ _id: { $in: schemeIds } }).lean()
    : [];
  const schemeById = new Map(schemes.map((s) => [String(s._id), s]));

  const graphByTrack = new Map<
    string,
    { graph: SchemeGraph; name: string; version: number; componentNodeIds: string[] } | null
  >();
  const tracks: TrackReport[] = [];

  for (const track of session.tracks) {
    const scheme = track.gradingSchemeId ? schemeById.get(String(track.gradingSchemeId)) : null;
    if (!scheme) {
      graphByTrack.set(track.track, null);
      tracks.push({
        track: track.track,
        schemeId: null,
        status: 'no-scheme',
        message: 'No grading scheme is pinned to this track yet, so grades cannot be computed.',
      });
      continue;
    }

    // Prefer the pinned version. Falling back to the draft is reported explicitly rather
    // than done silently - grading off an unpublished draft is a real caveat.
    const pinned = scheme.versions?.find((v) => v.version === track.gradingSchemeVersion);
    const graph: SchemeGraph = pinned
      ? { nodes: pinned.nodes, edges: pinned.edges }
      : { nodes: scheme.nodes || [], edges: scheme.edges || [] };

    const issues = validateScheme(graph);
    if (issues.length > 0) {
      graphByTrack.set(track.track, null);
      tracks.push({
        track: track.track,
        schemeId: String(scheme._id),
        schemeName: scheme.name,
        status: 'invalid',
        issues,
      });
      continue;
    }

    graphByTrack.set(track.track, {
      graph,
      name: scheme.name,
      version: pinned ? pinned.version : 0,
      componentNodeIds: componentNodeIds(graph),
    });
    tracks.push({
      track: track.track,
      schemeId: String(scheme._id),
      schemeName: scheme.name,
      version: pinned ? pinned.version : 0,
      status: pinned ? 'ok' : 'unpublished-draft',
      ...(pinned
        ? {}
        : { message: 'This scheme has no published version; grades use the current draft.' }),
    });
  }

  const groupIds = groups.map((g) => g._id);
  const submissions = await CapstoneMarkSubmission.find({
    sessionId,
    groupId: { $in: groupIds },
    status: 'submitted',
  }).lean();

  const marksByStudent = new Map<string, MarkInput[]>();
  const rawByStudent = new Map<string, typeof submissions>();
  for (const sub of submissions) {
    const key = String(sub.studentAccountId);
    if (!marksByStudent.has(key)) marksByStudent.set(key, []);
    marksByStudent.get(key)!.push({
      component: sub.component,
      submitterId: String(sub.submitterId),
      submitterRole: sub.submitterRole,
      rawScore: sub.rawScore,
      rubricMax: sub.rubricMax ?? null,
    });
    if (!rawByStudent.has(key)) rawByStudent.set(key, []);
    rawByStudent.get(key)!.push(sub);
  }

  const studentIds = new Set<string>();
  const userIds = new Set<string>();
  for (const group of groups) {
    for (const member of group.members) {
      if (!member.removedAt) studentIds.add(String(member.studentAccountId));
    }
    if (group.supervisorId) userIds.add(String(group.supervisorId));
    for (const ev of group.evaluators) userIds.add(String(ev.evaluatorId));
  }
  for (const sub of submissions) {
    userIds.add(String(sub.submitterId));
    if (sub.enteredBy) userIds.add(String(sub.enteredBy));
  }

  const [students, users] = await Promise.all([
    StudentAccount.find({ _id: { $in: [...studentIds] } }).select('studentId name email').lean(),
    User.find({ _id: { $in: [...userIds] } }).select('name email').lean(),
  ]);
  const studentById = new Map(students.map((s) => [String(s._id), s]));
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const groupGrades: GroupGrades[] = groups.map((group) => {
    const resolved = graphByTrack.get(group.track);
    const supervisor = userById.get(String(group.supervisorId));

    // The coordinator's choice, or every evaluator when there are too few to choose between -
    // previously a group with one or two evaluators and no explicit choice counted none of them.
    const activeEvaluatorIds = group.evaluators.filter((e) => !e.unassignedAt).map((e) => String(e.evaluatorId));
    const chosenReport = countedEvaluators(group.chosenEvaluators?.report, activeEvaluatorIds);
    const chosenPresentation = countedEvaluators(group.chosenEvaluators?.presentation, activeEvaluatorIds);

    const members: MemberGrade[] = group.members
      .filter((member) => !member.removedAt)
      .map((member) => {
        const studentAccountId = String(member.studentAccountId);
        const student = studentById.get(studentAccountId);

        // Flatten every submission for this student, marking which ones the scheme will
        // actually count - the detail sheet needs to show an uncounted evaluator's mark as
        // present but excluded, not omit it.
        const submissionRows = (rawByStudent.get(studentAccountId) || []).map((sub) => {
          const submitterId = String(sub.submitterId);
          let counted = sub.submitterRole === 'supervisor';
          if (sub.submitterRole === 'evaluator') {
            if (sub.component === 'report') counted = chosenReport.includes(submitterId);
            else if (sub.component === 'presentation') counted = chosenPresentation.includes(submitterId);
          }
          return {
            component: sub.component,
            submitterId,
            submitterName: userById.get(submitterId)?.name || submitterId,
            // Set when a coordinator entered this grader's paper sheet for them.
            enteredByName:
              sub.enteredBy && String(sub.enteredBy) !== submitterId
                ? userById.get(String(sub.enteredBy))?.name || 'a coordinator'
                : null,
            submitterRole: sub.submitterRole,
            counted,
            rawScore: sub.rawScore,
            rubricMax: sub.rubricMax ?? null,
            rubricScores: sub.rubricScores ?? null,
          };
        });

        const base = {
          studentAccountId,
          studentId: student?.studentId ?? member.studentIdText,
          name: student?.name ?? null,
          email: student?.email ?? null,
          submissions: submissionRows,
        };

        if (!resolved) {
          return { ...base, score: null, letter: null, trace: [], missingComponents: [] };
        }

        const ctx: StudentContext = {
          studentAccountId,
          marks: marksByStudent.get(studentAccountId) || [],
          supervisorId: String(group.supervisorId),
          chosenEvaluators: { report: chosenReport, presentation: chosenPresentation },
          chosenAggregate: {
            report: group.chosenAggregate?.report,
            presentation: group.chosenAggregate?.presentation,
          },
        };

        try {
          return { ...base, ...evaluateScheme(resolved.graph, ctx) };
        } catch (err) {
          // One malformed student must not fail the whole cohort.
          return {
            ...base,
            score: null,
            letter: null,
            trace: [],
            missingComponents: [],
            error: err instanceof Error ? err.message : 'Could not compute',
          };
        }
      });

    return {
      groupId: String(group._id),
      track: group.track,
      groupNumber: group.groupNumber,
      projectTitle: group.projectTitle,
      supervisorName: supervisor?.name ?? null,
      schemeName: resolved?.name ?? null,
      schemeVersion: resolved?.version ?? null,
      componentNodeIds: resolved?.componentNodeIds ?? [],
      chosenAggregate: {
        report: group.chosenAggregate?.report,
        presentation: group.chosenAggregate?.presentation,
      },
      members,
    };
  });

  return { tracks, groups: groupGrades };
}

/** Default components per grading role - used when no scheme-derived list is supplied (lib/capstoneMarkingPlan.ts). */
export const COMPONENTS_BY_ROLE: Record<'supervisor' | 'evaluator', CapstoneMarkComponent[]> = {
  supervisor: ['report', 'presentation', 'peer', 'weeklyJournal'],
  evaluator: ['report', 'presentation'],
};

/**
 * What a supervisor/evaluator may see of one student's grade (coordinators see everything).
 *
 * To keep graders from being anchored by someone else's score, another grader's mark for a
 * component is shown only once this grader has submitted their own for that component. The
 * computed total and component breakdown would reveal those marks indirectly, so they stay
 * hidden until the grader has submitted every component their role grades.
 */
export function redactMemberForGrader(
  member: MemberGrade,
  viewerId: string,
  /** The components this grader marks: their role's default, or the list the active scheme gives them. */
  graded: 'supervisor' | 'evaluator' | CapstoneMarkComponent[]
): MemberGrade {
  const mine = new Set(member.submissions.filter((s) => s.submitterId === viewerId).map((s) => s.component));
  const submissions = member.submissions.filter((s) => s.submitterId === viewerId || mine.has(s.component));
  const components = Array.isArray(graded) ? graded : COMPONENTS_BY_ROLE[graded];
  const owed = components.filter((c) => !mine.has(c));
  if (owed.length === 0) return { ...member, submissions };
  return { ...member, submissions, score: null, letter: null, trace: [], gradeHiddenUntil: owed };
}
