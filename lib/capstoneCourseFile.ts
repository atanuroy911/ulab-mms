// The numbers behind a capstone track's course file (the CSE 4098A/B workbooks in
// public/templates/capstone): grade sheet, per-component marking detail, CO evaluation,
// CO-PO attainment and CQI. Pure - it takes the output of computeSessionGrades plus the
// pinned scheme and its outcomes, so every figure here is the same one the grades page shows.
//
// Everything is dynamic: the grade-sheet columns are the scheme's components, the detail
// sheets are whichever components evaluators mark, and the CO sheets follow the scheme's
// outcomes. Nothing assumes the 4098A layout.
//
// Where it deliberately differs from the workbooks:
// - the peer CO uses the student's actual peer mark (the 4098A workbook hard-codes 2);
// - the CO evaluation averages the supervisor with every COUNTED evaluator (the workbook's
//   fixed "Evaluator 1, Evaluator 2, Supervisor" is the two-evaluator case of this);
// - a PO is attained against its own threshold rather than a formula pointing at a
//   non-existent GradeSheet column.

import { evaluateScheme, componentNodeIds, type SchemeGraph, type MarkInput } from '@/lib/gradingEngine';
import { planFromGraph } from '@/lib/capstoneMarkingPlan';
import {
  PO_KEYS,
  outcomeMax,
  taggedCriteria,
  type CapstoneOutcome,
  type CapstoneOutcomesConfig,
} from '@/lib/capstoneOutcomes';
import type { GroupGrades, MemberGrade } from '@/lib/capstoneGrades';
import type { CapstoneMarkComponent } from '@/models/CapstoneMarkSubmission';

export const COMPONENT_LABELS: Record<string, string> = {
  report: 'Report',
  presentation: 'Presentation',
  peer: 'Peer',
  weeklyJournal: 'Weekly Journal',
  poster: 'Poster',
};

/** One column of the grade sheet: a scheme component such as "Report (out of 40)". */
export interface ComponentColumn {
  nodeId: string;
  label: string;
  /** What a student with full marks from every grader gets here - the column's "out of". */
  max: number;
  /** The single mark component feeding it, when there is exactly one (used by component COs). */
  component: CapstoneMarkComponent | null;
}

export interface Grader {
  id: string;
  name: string;
  initials: string;
}

export interface DetailCell {
  raw: number;
  counted: boolean;
}

/** One student's row on a component's marking-detail sheet. */
export interface DetailRow {
  supervisor: number | null;
  /** evaluatorId -> their mark, for every evaluator who marked this student. */
  evaluators: Record<string, DetailCell>;
  /** The counted evaluators combined the way the coordinator chose (average or best). */
  evaluatorCombined: number | null;
  combineMode: 'mean' | 'max';
  /** The scheme's resulting mark for the component, when it has its own column. */
  final: number | null;
}

export interface DetailSheet {
  component: CapstoneMarkComponent;
  label: string;
  rawMax: number;
  finalLabel: string | null;
  finalMax: number | null;
  evaluators: Grader[];
}

/** One grader's CO sums for a student (rubric-measured COs only). */
export interface CoGraderScores {
  graderId: string;
  role: 'supervisor' | 'evaluator';
  name: string;
  /** coKey -> marks. */
  values: Record<string, number>;
  /** True when only a total was entered, so the CO split is prorated from it. */
  estimated: boolean;
}

export interface StudentCourseFileRow {
  studentAccountId: string;
  studentId: string;
  name: string;
  groupNumber: number;
  projectTitle: string;
  supervisorName: string;
  score: number | null;
  letter: string | null;
  /** nodeId -> value, for the grade-sheet columns. */
  components: Record<string, number | null>;
  missing: CapstoneMarkComponent[];
  details: Partial<Record<CapstoneMarkComponent, DetailRow>>;
  /** Per-grader CO sums, per rubric component (report / presentation). */
  coGraders: Partial<Record<'report' | 'presentation', CoGraderScores[]>>;
  /** coKey -> marks (null when there is nothing to measure it from yet). */
  co: Record<string, number | null>;
  coPercent: Record<string, number>;
  coAttained: Record<string, boolean>;
  poPercent: Record<string, number>;
  poAttained: Record<string, boolean>;
}

export interface AttainmentSummary {
  key: string;
  average: number;
  attainedCount: number;
  ratio: number;
  meetsTarget: boolean;
}

export interface CourseFileData {
  track: string;
  columns: ComponentColumn[];
  totalMax: number;
  bands: Array<{ min: number; letter: string }>;
  outcomes: Array<CapstoneOutcome & { max: number }>;
  thresholds: CapstoneOutcomesConfig['thresholds'];
  /** POs at least one CO maps to, in PO order. */
  pos: string[];
  detailSheets: DetailSheet[];
  /** Rubric components that have CO-tagged criteria, in the order they appear on the CO sheet. */
  coRubricComponents: Array<'report' | 'presentation'>;
  rows: StudentCourseFileRow[];
  gradeDistribution: Array<{ letter: string; count: number }>;
  coSummary: AttainmentSummary[];
  poSummary: AttainmentSummary[];
  /** Students still missing a component - the file is provisional while this is non-zero. */
  incompleteCount: number;
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const HONORIFICS = new Set(['DR', 'MD', 'MR', 'MRS', 'MS', 'PROF', 'ENGR', 'SK', 'SHEIKH']);

/** Short column headers the way the workbooks label faculty columns ("MGK"), unique per sheet. */
export function initialsFor(names: Array<{ id: string; name: string }>): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Map<string, number>();
  for (const { id, name } of names) {
    const words = name
      .replace(/[^A-Za-z\s.-]/g, ' ')
      .split(/[\s.-]+/)
      .filter(Boolean);
    const meaningful = words.filter((w) => !HONORIFICS.has(w.toUpperCase()));
    let base = (meaningful.length ? meaningful : words).map((w) => w[0].toUpperCase()).join('') || '?';
    if (base.length === 1 && meaningful[0]) base = meaningful[0].slice(0, 3).toUpperCase();
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    out.set(id, n === 1 ? base : `${base}${n}`);
  }
  return out;
}

/** Which mark components flow into a node (walking back through the graph to its sources). */
function upstreamComponents(graph: SchemeGraph, nodeId: string): Set<CapstoneMarkComponent> {
  const found = new Set<CapstoneMarkComponent>();
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = graph.nodes.find((n) => n.id === id);
    if (node?.type === 'source' && node.data?.component) found.add(node.data.component as CapstoneMarkComponent);
    for (const e of graph.edges) if (e.target === id) stack.push(e.source);
  }
  return found;
}

/**
 * Every node's value when each grader gives full marks for everything they mark. That is
 * each component's "out of" without having to read it off a formula (40 for the default
 * report blend, 45 for presentation, 5 for peer, ...).
 */
export function perfectTrace(graph: SchemeGraph, track: string): Record<string, number> {
  const plan = planFromGraph(graph, track);
  const marks: MarkInput[] = [
    ...plan.supervisor.map((r) => ({ component: r.component, submitterId: 'SUP', submitterRole: 'supervisor' as const, rawScore: r.max, rubricMax: r.max })),
    ...plan.evaluator.map((r) => ({ component: r.component, submitterId: 'EV', submitterRole: 'evaluator' as const, rawScore: r.max, rubricMax: r.max })),
  ];
  const chosen = Object.fromEntries(plan.evaluator.map((r) => [r.component, ['EV']]));
  const result = evaluateScheme(graph, { studentAccountId: 'perfect', marks, supervisorId: 'SUP', chosenEvaluators: chosen });
  return { ...Object.fromEntries(result.trace.map((t) => [t.nodeId, t.value])), __score: result.score };
}

function combine(values: number[], mode: 'mean' | 'max'): number | null {
  if (!values.length) return null;
  return mode === 'max' ? Math.max(...values) : mean(values);
}

export function buildCourseFileData(params: {
  track: string;
  graph: SchemeGraph;
  outcomes: CapstoneOutcomesConfig;
  groups: GroupGrades[];
}): CourseFileData {
  const { track, graph, groups } = params;
  const warnings: string[] = [];
  const perfect = perfectTrace(graph, track);
  const plan = planFromGraph(graph, track);

  // ── Grade-sheet columns: the scheme's components ─────────────────────────────────────
  const columns: ComponentColumn[] = componentNodeIds(graph).map((nodeId) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    const comps = [...upstreamComponents(graph, nodeId)];
    return {
      nodeId,
      label: String(node?.data?.label || nodeId),
      max: round2(perfect[nodeId] ?? 0),
      component: comps.length === 1 ? comps[0] : null,
    };
  });
  const totalMax = round2(perfect.__score ?? columns.reduce((a, c) => a + c.max, 0));
  const columnFor = (component: CapstoneMarkComponent) => columns.find((c) => c.component === component) || null;

  const bandsNode = graph.nodes.find((n) => n.type === 'gradeBands');
  const bands = [...((bandsNode?.data?.bands as Array<{ min: number; letter: string }>) || [])].sort((a, b) => b.min - a.min);

  // ── Outcomes ─────────────────────────────────────────────────────────────────────────
  const outcomes = params.outcomes.outcomes.map((o) => ({ ...o, max: outcomeMax(o, track) }));
  const thresholds = params.outcomes.thresholds;
  for (const o of outcomes) {
    if (o.source.kind === 'component' && !columnFor(o.source.component)) {
      warnings.push(`${o.key} is measured from ${COMPONENT_LABELS[o.source.component] || o.source.component}, which this scheme has no column for - it is left blank.`);
    }
  }
  const pos = PO_KEYS.filter((po) => outcomes.some((o) => o.pos.includes(po)));
  const coRubricComponents = (['report', 'presentation'] as const).filter((c) =>
    outcomes.some((o) => o.source.kind === 'rubric' && o.source.component === c)
  );

  // ── Detail sheets: every component evaluators mark ────────────────────────────────────
  const trackMembers = groups.flatMap((g) => g.members.map((m) => ({ group: g, member: m })));
  const detailComponents = plan.evaluator.map((r) => r.component);
  const detailSheets: DetailSheet[] = detailComponents.map((component) => {
    const seen = new Map<string, string>();
    for (const { member } of trackMembers) {
      for (const s of member.submissions) {
        if (s.component === component && s.submitterRole === 'evaluator') seen.set(s.submitterId, s.submitterName);
      }
    }
    const list = [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    const initials = initialsFor(list);
    const col = columnFor(component);
    const rawMax =
      plan.supervisor.find((r) => r.component === component)?.max ?? plan.evaluator.find((r) => r.component === component)?.max ?? 0;
    return {
      component,
      label: COMPONENT_LABELS[component] || component,
      rawMax,
      finalLabel: col?.label ?? null,
      finalMax: col?.max ?? null,
      evaluators: list.map((e) => ({ ...e, initials: initials.get(e.id)! })),
    };
  });

  // ── Per student ──────────────────────────────────────────────────────────────────────
  const rows: StudentCourseFileRow[] = trackMembers.map(({ group, member }) => buildRow(group, member));

  function buildRow(group: GroupGrades, member: MemberGrade): StudentCourseFileRow {
    const traceById = new Map(member.trace.map((t) => [t.nodeId, t.value]));
    const components = Object.fromEntries(columns.map((c) => [c.nodeId, traceById.has(c.nodeId) ? traceById.get(c.nodeId)! : null]));

    const details: StudentCourseFileRow['details'] = {};
    for (const component of detailComponents) {
      const subs = member.submissions.filter((s) => s.component === component);
      const evaluators: Record<string, DetailCell> = {};
      for (const s of subs) if (s.submitterRole === 'evaluator') evaluators[s.submitterId] = { raw: s.rawScore, counted: s.counted };
      const mode = (group.chosenAggregate as Record<string, 'mean' | 'max' | undefined>)[component] || 'mean';
      const col = columnFor(component);
      details[component] = {
        supervisor: subs.find((s) => s.submitterRole === 'supervisor')?.rawScore ?? null,
        evaluators,
        evaluatorCombined: combine(
          subs.filter((s) => s.submitterRole === 'evaluator' && s.counted).map((s) => s.rawScore),
          mode
        ),
        combineMode: mode,
        final: col ? components[col.nodeId] : null,
      };
    }

    // CO sums per counted grader, for each rubric component that measures a CO.
    const coGraders: StudentCourseFileRow['coGraders'] = {};
    for (const component of coRubricComponents) {
      const cos = outcomes.filter((o) => o.source.kind === 'rubric' && o.source.component === component);
      const counted = member.submissions
        .filter((s) => s.component === component && s.counted)
        .sort((a, b) => (a.submitterRole === b.submitterRole ? a.submitterName.localeCompare(b.submitterName) : a.submitterRole === 'evaluator' ? -1 : 1));
      coGraders[component] = counted.map((s) => {
        const scores = s.rubricScores && Object.keys(s.rubricScores).length ? s.rubricScores : null;
        const values: Record<string, number> = {};
        for (const o of cos) {
          const idx = taggedCriteria(component, track, o.key);
          values[o.key] = scores
            ? idx.reduce((sum, i) => sum + (Number(scores[`c${i}`]) || 0), 0)
            : // Only a total was typed in (a paper sheet copied as one number): split it
              // across the COs in proportion to their share of the rubric.
              round2(((s.rubricMax ? s.rawScore / s.rubricMax : 0) || 0) * o.max);
        }
        return { graderId: s.submitterId, role: s.submitterRole, name: s.submitterName, values, estimated: !scores };
      });
    }

    const co: Record<string, number | null> = {};
    for (const o of outcomes) {
      if (o.source.kind === 'rubric') {
        const graders = coGraders[o.source.component] || [];
        co[o.key] = graders.length ? round2(mean(graders.map((g) => g.values[o.key] ?? 0))) : null;
      } else {
        const col = columnFor(o.source.component);
        const value = col ? components[col.nodeId] : null;
        co[o.key] = col && value !== null && col.max > 0 ? round2((value / col.max) * o.source.max) : null;
      }
    }

    const coPercent: Record<string, number> = {};
    const coAttained: Record<string, boolean> = {};
    for (const o of outcomes) {
      coPercent[o.key] = o.max > 0 ? (co[o.key] ?? 0) / o.max : 0;
      coAttained[o.key] = coPercent[o.key] >= thresholds.co;
    }
    // A PO's percentage is the average of the percentages of the COs mapped to it (the
    // workbook's MMULT(CO%, mapping column) / column total).
    const poPercent: Record<string, number> = {};
    const poAttained: Record<string, boolean> = {};
    for (const po of pos) {
      const mapped = outcomes.filter((o) => o.pos.includes(po));
      poPercent[po] = mean(mapped.map((o) => coPercent[o.key]));
      poAttained[po] = poPercent[po] >= thresholds.po;
    }

    return {
      studentAccountId: member.studentAccountId,
      studentId: member.studentId,
      name: member.name || '',
      groupNumber: group.groupNumber,
      projectTitle: group.projectTitle,
      supervisorName: group.supervisorName || '',
      score: member.score,
      letter: member.letter,
      components,
      missing: member.missingComponents,
      details,
      coGraders,
      co,
      coPercent,
      coAttained,
      poPercent,
      poAttained,
    };
  }

  const n = rows.length;
  const summarise = (keys: string[], pctOf: (r: StudentCourseFileRow, k: string) => number, attained: (r: StudentCourseFileRow, k: string) => boolean) =>
    keys.map((key) => {
      const attainedCount = rows.filter((r) => attained(r, key)).length;
      const ratio = n ? attainedCount / n : 0;
      return { key, average: mean(rows.map((r) => pctOf(r, key))), attainedCount, ratio, meetsTarget: ratio >= thresholds.classTarget };
    });

  const letterCounts = new Map<string, number>();
  for (const r of rows) if (r.letter) letterCounts.set(r.letter, (letterCounts.get(r.letter) || 0) + 1);
  const gradeDistribution = bands.map((b) => ({ letter: b.letter, count: letterCounts.get(b.letter) || 0 }));

  const incompleteCount = rows.filter((r) => r.missing.length > 0 || r.score === null).length;
  if (incompleteCount > 0) {
    warnings.unshift(`${incompleteCount} student${incompleteCount === 1 ? ' is' : 's are'} still missing marks, so this file is provisional.`);
  }
  if (rows.some((r) => Object.values(r.coGraders).some((gs) => gs?.some((g) => g.estimated)))) {
    warnings.push('Marks marked * were entered as a total without the rubric, so their CO split is prorated from the total.');
  }

  return {
    track,
    columns,
    totalMax,
    bands,
    outcomes,
    thresholds,
    pos,
    detailSheets,
    coRubricComponents,
    rows,
    gradeDistribution,
    coSummary: summarise(outcomes.map((o) => o.key), (r, k) => r.coPercent[k], (r, k) => r.coAttained[k]),
    poSummary: summarise(pos, (r, k) => r.poPercent[k], (r, k) => r.poAttained[k]),
    incompleteCount,
    warnings,
  };
}
