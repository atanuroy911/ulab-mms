/**
 * The capstone course file must reproduce the 4098A/B workbooks' arithmetic from the live
 * marks: component columns and their "out of", per-grader CO sums from rubric tags, the
 * supervisor + counted-evaluator CO average, scaled component COs, and CO/PO attainment.
 */
import { buildCourseFileData, initialsFor, perfectTrace } from '../lib/capstoneCourseFile';
import { defaultOutcomes, validateOutcomes, coTags, outcomeMax } from '../lib/capstoneOutcomes';
import { defaultCseScheme, evaluateScheme } from '../lib/gradingEngine';
import type { GroupGrades, MemberGrade } from '../lib/capstoneGrades';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  const ok =
    typeof got === 'number' && typeof expected === 'number'
      ? Math.abs(got - expected) < 0.011
      : JSON.stringify(got) === JSON.stringify(expected);
  if (ok) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

// ── Outcomes config ───────────────────────────────────────────────────────────────────────
check('tag with suffix', coTags('Organization of the Presentation Material [CO5: A1]'), ['CO5']);
check('plain tag', coTags('Problem statement [CO1]'), ['CO1']);
check('no tag', coTags('Conclusion'), []);
for (const t of ['A', 'B', 'C']) check(`default outcomes ${t} validate`, validateOutcomes(defaultOutcomes(t), t), []);

const outA = defaultOutcomes('A');
const maxA = Object.fromEntries(outA.outcomes.map((o) => [o.key, outcomeMax(o, 'A')]));
// Workbook 4098A: Report CO1 15, CO2 3, CO3 3; Peer CO4 5; Presentation CO5 10.
check('4098A CO maxima match the workbook', maxA, { CO1: 15, CO2: 3, CO3: 3, CO4: 5, CO5: 10 });
const maxB = Object.fromEntries(defaultOutcomes('B').outcomes.map((o) => [o.key, outcomeMax(o, 'B')]));
check('4098B CO maxima match the workbook', maxB, { CO1: 6, CO2: 3, CO3: 3, CO4: 3, CO5: 3, CO6: 6, CO7: 3, CO8: 3, CO9: 3, CO10: 5, CO11: 10 });

check('untagged rubric CO rejected', validateOutcomes({ track: 'A', outcomes: [{ key: 'CO7', source: { kind: 'rubric', component: 'report' }, pos: ['PO1'] }], thresholds: { co: 0.55, classTarget: 0.6, po: 0.55 } }, 'A').length, 1);
check('bad PO rejected', validateOutcomes({ track: 'A', outcomes: [{ key: 'CO4', source: { kind: 'component', component: 'peer', max: 5 }, pos: ['PO13'] }], thresholds: { co: 0.55, classTarget: 0.6, po: 0.55 } }, 'A').length, 1);
check('missing track rejected', validateOutcomes({ ...outA, track: undefined }, 'A').length, 1);
check('B defaults are written for B', defaultOutcomes('B').track, 'B');
check('duplicate CO rejected', validateOutcomes({ track: 'A', outcomes: [outA.outcomes[3], outA.outcomes[3]], thresholds: outA.thresholds }, 'A').length, 1);

// ── Column maxima come from the scheme itself ─────────────────────────────────────────────
const graph = defaultCseScheme('A');
const perfect = perfectTrace(graph, 'A');
check('report column out of 40', perfect.report_blend, 40);
check('presentation column out of 45', perfect.pres_blend, 45);
check('peer column out of 5', perfect.peer, 5);
check('perfect total 100', perfect.__score, 100);

// ── One 4098A student, graded by a supervisor and three evaluators (two counted) ─────────
// Report rubric (11 criteria, 0-3): c1..c5 = CO1, c6 = CO2, c7 = CO3.
const rubric = (vals: number[]) => Object.fromEntries(vals.map((v, i) => [`c${i}`, v]));
const supR = rubric([3, 3, 3, 2, 3, 3, 2, 3, 3, 3, 2]); // CO1 14, CO2 2, CO3 3; total 30
const e1R = rubric([2, 3, 2, 2, 3, 2, 3, 2, 2, 3, 2]); // CO1 12, CO2 3, CO3 2; total 26
const e2R = rubric([2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1]); // CO1 10, CO2 1, CO3 2; total 20
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

const sub = (component: string, id: string, role: 'supervisor' | 'evaluator', raw: number, max: number, counted = true, rubricScores: Record<string, number> | null = null) => ({
  component: component as never,
  submitterId: id,
  submitterName: { sup: 'Dr. Mahmudul Hasan', e1: 'Anika Sultana', e2: 'Md. Nafis Ahmed', e3: 'Zara Khan' }[id]!,
  submitterRole: role,
  counted,
  rawScore: raw,
  rubricMax: max,
  rubricScores,
});
const submissions = [
  sub('report', 'sup', 'supervisor', sum(supR), 33, true, supR),
  sub('report', 'e1', 'evaluator', sum(e1R), 33, true, e1R),
  sub('report', 'e2', 'evaluator', sum(e2R), 33, true, e2R),
  sub('report', 'e3', 'evaluator', 5, 33, false, null), // marked, but not counted
  sub('presentation', 'sup', 'supervisor', 36, 45),
  sub('presentation', 'e1', 'evaluator', 39, 45),
  sub('presentation', 'e2', 'evaluator', 33, 45),
  sub('peer', 'sup', 'supervisor', 4, 5),
  sub('weeklyJournal', 'sup', 'supervisor', 8, 10),
];
const ctxMarks = submissions.map((s) => ({ component: s.component, submitterId: s.submitterId, submitterRole: s.submitterRole, rawScore: s.rawScore, rubricMax: s.rubricMax }));
const evaluated = evaluateScheme(graph, {
  studentAccountId: 'st1',
  marks: ctxMarks,
  supervisorId: 'sup',
  chosenEvaluators: { report: ['e1', 'e2'], presentation: ['e1', 'e2'] },
});
const member: MemberGrade = {
  studentAccountId: 'st1', studentId: '221014001', name: 'Student One', email: null,
  submissions, ...evaluated,
};
const group: GroupGrades = {
  groupId: 'g1', track: 'A', groupNumber: 1, projectTitle: 'Smart Farming', supervisorName: 'Dr. Mahmudul Hasan',
  schemeName: 'CSE', schemeVersion: 1, componentNodeIds: [], chosenAggregate: {}, members: [member],
};

const file = buildCourseFileData({ track: 'A', graph, outcomes: outA, groups: [group] });
const row = file.rows[0];

check('grade-sheet columns', file.columns.map((c) => [c.nodeId, c.max, c.component]), [
  ['report_blend', 40, 'report'], ['pres_blend', 45, 'presentation'], ['peer', 5, 'peer'], ['journal', 10, 'weeklyJournal'],
]);
// Report: 40 * (0.6*30/33 + 0.4*23/33) = 40*(.545455+.278788) = 32.97
check('report column value', row.components.report_blend, 32.97);

// CO evaluation: supervisor + the two counted evaluators, equally weighted; e3 ignored.
check('CO graders are the counted ones', row.coGraders.report!.map((g) => g.graderId), ['e1', 'e2', 'sup']);
check('supervisor CO sums', row.coGraders.report!.find((g) => g.graderId === 'sup')!.values, { CO1: 14, CO2: 2, CO3: 3 });
check('CO1 final = (14+12+10)/3', row.co.CO1, 12);
check('CO2 final = (2+3+1)/3', row.co.CO2, 2);
check('CO3 final = (3+2+2)/3', row.co.CO3, 2.33);
check('peer CO uses the actual peer mark', row.co.CO4, 4);
// Presentation: 45*(0.6*36/45 + 0.4*36/45) = 36 -> 36*10/45 = 8
check('presentation CO scaled to 10', row.co.CO5, 8);

check('CO1 % = 12/15', row.coPercent.CO1, 0.8);
check('CO2 attained (66.7% >= 55%)', row.coAttained.CO2, true);
check('POs are the mapped ones', file.pos, ['PO2', 'PO9', 'PO10', 'PO11', 'PO12']);
check('PO2 follows CO1', row.poPercent.PO2, 0.8);

check('detail sheet per evaluator-marked component', file.detailSheets.map((d) => d.component), ['report', 'presentation']);
check('report detail lists every evaluator who marked', file.detailSheets[0].evaluators.map((e) => e.initials), ['AS', 'NA', 'ZK']);
check('uncounted evaluator shown but not counted', row.details.report!.evaluators.e3, { raw: 5, counted: false });
check('counted evaluators averaged', row.details.report!.evaluatorCombined, 23);
check('summary CO1 attained by 1 of 1', [file.coSummary[0].attainedCount, file.coSummary[0].meetsTarget], [1, true]);
check('grade distribution from the scheme bands', file.gradeDistribution.find((g) => g.letter === row.letter)?.count, 1);
check('complete student -> no provisional warning', file.incompleteCount, 0);

// A total typed in without the rubric: the CO split is prorated and flagged.
const noRubric = { ...member, submissions: member.submissions.map((s) => (s.submitterId === 'e2' && s.component === 'report' ? { ...s, rubricScores: null } : s)) };
const est = buildCourseFileData({ track: 'A', graph, outcomes: outA, groups: [{ ...group, members: [noRubric] }] });
const e2 = est.rows[0].coGraders.report!.find((g) => g.graderId === 'e2')!;
check('prorated CO1 = 20/33 * 15', e2.values.CO1, 9.09);
check('prorated flagged', e2.estimated, true);

check('initials skip honorifics and stay unique', [...initialsFor([
  { id: '1', name: 'Dr. Mahmudul Hasan' }, { id: '2', name: 'Md. Mehedi Hasan' }, { id: '3', name: 'Rafi' },
]).values()], ['MH', 'MH2', 'RAF']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
