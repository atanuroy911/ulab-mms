// CSE 4098C: the report rubric, the default scheme, the marking plan and the COs, checked
// against public/templates/capstone/CSE4098C_Summer2026.xlsx. The fixture holds the workbook's
// real presentation marks with its cached grades, plus students graded by an independent
// Python transcription of the workbook formulas (scripts/fixtures/track-c-workbook.json).
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateScheme, evaluateScheme, defaultCseScheme } from '../lib/gradingEngine';
import type { MarkInput } from '../lib/gradingEngine';
import { REPORT_RUBRICS } from '../lib/capstoneRubrics';
import { defaultMarkingPlan, planFromGraph } from '../lib/capstoneMarkingPlan';
import { defaultOutcomes, outcomeMax, sourceMax, validateOutcomes, taggedCriteria, cleanOutcomes } from '../lib/capstoneOutcomes';
import { buildCourseFileData } from '../lib/capstoneCourseFile';
import type { GroupGrades, MemberGrade } from '../lib/capstoneGrades';

const round2 = (n: number) => Math.round(n * 100) / 100;
let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown, tol = 1e-9) {
  const ok = typeof got === 'number' && typeof expected === 'number' ? Math.abs(got - expected) <= tol : JSON.stringify(got) === JSON.stringify(expected);
  if (ok) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

// ── Rubric ──────────────────────────────────────────────────────────────────────────────
const rubric = REPORT_RUBRICS.C;
check('13 criteria (max 39)', rubric.length * 3, 39);
check('C no longer borrows the B rubric', rubric === REPORT_RUBRICS.B, false);
check('every criterion has three levels', rubric.every((c) => c.levels.length === 3 && c.levels.every((l) => l.length > 10)), true);
const tagsPer = (co: string) => taggedCriteria('report', 'C', co).length;
check('CO criteria counts as the CO Report sheet (CO1 6, CO5 6, rest 3)', ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6', 'CO7', 'CO8'].map((c) => tagsPer(c) * 3), [6, 3, 3, 3, 6, 3, 3, 3]);
check('three criteria carry no CO', rubric.filter((c) => !/\[CO\d/.test(c.label)).map((c) => c.label.split(/[,&]/)[0].trim()), ['Abstract', 'Conclusion', 'References']);
check('labels tidy ("Activity [CO2]", no "hasclearly")', [rubric.some((c) => c.label === 'Project Management and Financial Activity [CO2]'), rubric.some((c) => c.levels.some((l) => l.includes('hasclearly')))], [true, false]);

// ── Default scheme ─────────────────────────────────────────────────────────────────────────
const scheme = defaultCseScheme('C');
check('default C scheme is valid', validateScheme(scheme).map((i) => i.message), []);
check('A and B schemes unchanged in shape', [defaultCseScheme('A').nodes.length, defaultCseScheme('B').nodes.length], [11, 11]);
check('C has a poster part, evaluators chosen like presentation', scheme.nodes.filter((n) => n.data?.component === 'poster').map((n) => n.data?.scope), ['supervisor', 'chosenEvaluator']);
check('A+ at 95', (scheme.nodes.find((n) => n.type === 'gradeBands')!.data.bands as Array<{ min: number; letter: string }>)[0], { min: 95, letter: 'A+' });

// ── Marking plan ───────────────────────────────────────────────────────────────────────────
const plan = planFromGraph(scheme, 'C');
check('plan from the C scheme: supervisor', plan.supervisor, [
  { component: 'report', max: 39 },
  { component: 'presentation', max: 45 },
  { component: 'peer', max: 5 },
  { component: 'weeklyJournal', max: 10 },
  { component: 'poster', max: 12 },
]);
check('plan from the C scheme: evaluators', plan.evaluator, [
  { component: 'report', max: 39 },
  { component: 'presentation', max: 45 },
  { component: 'poster', max: 12 },
]);
check('default plan (no scheme pinned) matches', [defaultMarkingPlan('C').supervisor, defaultMarkingPlan('C').evaluator], [plan.supervisor, plan.evaluator]);
check('A and B default plans have no poster', [defaultMarkingPlan('A'), defaultMarkingPlan('B')].some((p) => [...p.supervisor, ...p.evaluator].some((r) => r.component === 'poster')), false);

// ── COs ────────────────────────────────────────────────────────────────────────────────────
const cos = defaultOutcomes('C');
check('C COs valid against the C rubric', validateOutcomes(cos, 'C'), []);
check('ten COs', cos.outcomes.map((o) => o.key), ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6', 'CO7', 'CO8', 'CO9', 'CO10']);
check('CO -> PO as the workbook', cos.outcomes.map((o) => o.pos[0]), ['PO12', 'PO11', 'PO5', 'PO3', 'PO4', 'PO6', 'PO7', 'PO8', 'PO9', 'PO10']);
check('marks per CO as the workbook (CO5 = report 6 + poster 20)', cos.outcomes.map((o) => outcomeMax(o, 'C')), [6, 3, 3, 3, 26, 3, 3, 3, 5, 10]);
const co5 = cos.outcomes.find((o) => o.key === 'CO5')!;
check('CO5 main measure alone is 6', sourceMax(co5, 'C'), 6);
check('the added measure survives saving', cleanOutcomes(cos).outcomes.find((o) => o.key === 'CO5')?.also, { kind: 'component', component: 'poster', max: 20 });
check('an added measure out of 0 is refused', validateOutcomes({ ...cos, outcomes: [{ ...co5, also: { kind: 'component', component: 'poster', max: 0 } }] }, 'C').length > 0, true);
check('A and B COs untouched', [defaultOutcomes('A').outcomes.length, defaultOutcomes('B').outcomes.length], [5, 11]);

// ── Against the workbook ───────────────────────────────────────────────────────────────────
interface Fixture {
  real: Array<{ row: number; studentId: string; sup: number; evs: number[]; presentation: number }>;
  synthetic: Array<{
    marks: { report: [number, number[]]; presentation: [number, number[]]; poster: [number, number[]]; peer: number; weeklyJournal: number };
    expected: { report: number; presentation: number; poster: number; total: number; letter: string };
  }>;
}
const fixture: Fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'track-c-workbook.json'), 'utf8'));
const MAX = { report: 39, presentation: 45, poster: 12 } as const;
const graded = (parts: Partial<Record<'report' | 'presentation' | 'poster', [number, number[]]>>, peer?: number, journal?: number) => {
  const marks: MarkInput[] = [];
  const evIds = new Set<string>();
  for (const [component, pair] of Object.entries(parts) as Array<['report' | 'presentation' | 'poster', [number, number[]]]>) {
    marks.push({ component, submitterId: 'sup', submitterRole: 'supervisor', rawScore: pair[0], rubricMax: MAX[component] });
    pair[1].forEach((v, i) => {
      evIds.add(`e${i}`);
      marks.push({ component, submitterId: `e${i}`, submitterRole: 'evaluator', rawScore: v, rubricMax: MAX[component] });
    });
  }
  if (peer !== undefined) marks.push({ component: 'peer', submitterId: 'sup', submitterRole: 'supervisor', rawScore: peer, rubricMax: 5 });
  if (journal !== undefined) marks.push({ component: 'weeklyJournal', submitterId: 'sup', submitterRole: 'supervisor', rawScore: journal, rubricMax: 10 });
  const ids = [...evIds];
  const r = evaluateScheme(scheme, { studentAccountId: 's', marks, supervisorId: 'sup', chosenEvaluators: { report: ids, presentation: ids, poster: ids } });
  const at = (id: string) => r.trace.find((t) => t.nodeId === id)?.value;
  return { report: at('report_blend'), presentation: at('pres_blend'), poster: at('poster_blend'), total: r.score, letter: r.letter };
};

// Real students: the workbook's own presentation grade column.
let realOk = 0;
for (const s of fixture.real) {
  const got = graded({ presentation: [s.sup, s.evs] }).presentation;
  if (got !== undefined && Math.abs(got - s.presentation) < 1e-9) realOk += 1;
  else console.log(`      workbook row ${s.row} (${s.studentId}): app ${got}, workbook ${s.presentation}`);
}
check(`real presentation grades match the workbook exactly (${fixture.real.length} students)`, realOk, fixture.real.length);

// Synthetic students: every part and the total, to the cent.
const mismatches: string[] = [];
for (const [i, s] of fixture.synthetic.entries()) {
  const got = graded({ report: s.marks.report, presentation: s.marks.presentation, poster: s.marks.poster }, s.marks.peer, s.marks.weeklyJournal);
  for (const k of ['report', 'presentation', 'poster', 'total'] as const) {
    if (Math.abs((got[k] as number) - s.expected[k]) > 1e-6) mismatches.push(`#${i} ${k}: app ${got[k]}, workbook ${s.expected[k]}`);
  }
  if (got.letter !== s.expected.letter) mismatches.push(`#${i} letter: app ${got.letter}, workbook ${s.expected.letter}`);
}
if (mismatches.length) console.log('      ' + mismatches.slice(0, 10).join('\n      '));
check(`report, presentation, poster, total and letter match the workbook formulas (${fixture.synthetic.length} students)`, mismatches.length, 0);

// Hand-worked example: report sup 30/39, evs 27,33; presentation sup 36/45, evs 30,39;
// poster sup 10/12, evs 9,11; peer 4; journal 8.
//   report: E=round(40*30/39)=30.77, Z=round(40*30/39)=30.77 -> 30.77
//   presentation: E=40, Y=round(50*34.5/45)=38.33 -> Z=round(24+15.332)=39.33 -> round(39.33/2)=19.67
//   poster: E=round(50*10/12)=41.67, Z=round(50*10/12)=41.67 -> 41.67 -> round(41.67*0.4)=16.67
//   total 30.77+19.67+16.67+4+8 = 79.11 -> B+
const worked = graded({ report: [30, [27, 33]], presentation: [36, [30, 39]], poster: [10, [9, 11]] }, 4, 8);
check('worked example', worked, { report: 30.77, presentation: 19.67, poster: 16.67, total: 79.11, letter: 'B+' });

// ── Poster evaluators are chosen on their own, like presentation's ──────────────────────────
{
  const marks: MarkInput[] = [
    { component: 'presentation', submitterId: 'sup', submitterRole: 'supervisor', rawScore: 36, rubricMax: 45 },
    { component: 'poster', submitterId: 'sup', submitterRole: 'supervisor', rawScore: 12, rubricMax: 12 },
    ...(['e1', 'e2', 'e3'] as const).flatMap((e, i) => [
      { component: 'presentation' as const, submitterId: e, submitterRole: 'evaluator' as const, rawScore: [45, 18, 36][i], rubricMax: 45 },
      { component: 'poster' as const, submitterId: e, submitterRole: 'evaluator' as const, rawScore: [3, 12, 9][i], rubricMax: 12 },
    ]),
  ];
  const all = ['e1', 'e2', 'e3'];
  const run = (extra: Record<string, unknown>) => {
    const r = evaluateScheme(scheme, { studentAccountId: 's', supervisorId: 'sup', marks, chosenEvaluators: { presentation: all, report: all, poster: all }, ...extra });
    return { pres: r.trace.find((t) => t.nodeId === 'pres_blend')?.value, poster: r.trace.find((t) => t.nodeId === 'poster_blend')?.value };
  };
  const base = run({});
  // poster all: sup 50, ev round(50*8/12)=33.33 -> round(30+13.332)=43.33 -> round(43.33*0.4)=17.33
  check('poster, all evaluators averaged', base.poster, 17.33);
  // poster top 2 (12, 9): ev round(50*10.5/12)=43.75 -> round(30+17.5)=47.5 -> 19
  check('poster top 2', run({ evaluatorTopK: { poster: 2 } }).poster, 19);
  // poster picked e1 only... picked e1,e3 (3, 9): ev 25 -> round(30+10)=40 -> 16
  check('poster picked evaluators', run({ chosenEvaluators: { presentation: all, report: all, poster: ['e1', 'e3'] } }).poster, 16);
  // poster best (12): ev 50 -> 50 -> 20
  check('poster best', run({ chosenAggregate: { poster: 'max' } }).poster, 20);
  check('a poster choice leaves presentation alone', [run({ evaluatorTopK: { poster: 1 } }).pres, run({ chosenAggregate: { poster: 'max' } }).pres], [base.pres, base.pres]);
  check('a presentation choice leaves the poster alone', run({ evaluatorTopK: { presentation: 1 } }).poster, base.poster);
  check('...while changing presentation', run({ evaluatorTopK: { presentation: 1 } }).pres !== base.pres, true);
  check('no poster evaluator chosen -> none of their marks count', run({ chosenEvaluators: { presentation: all, report: all, poster: [] } }).poster, round2(round2(30 + 0) * 0.4));
}

// ── Course file: CO5 = the report's [CO5] criteria + the poster scaled to 20 ─────────────────
{
  // Report rubric c0..c12: full marks on the two [CO5] criteria, 2 on every other one.
  const co5Idx = taggedCriteria('report', 'C', 'CO5');
  const scores = Object.fromEntries(rubric.map((_, i) => [`c${i}`, co5Idx.includes(i) ? 3 : 2]));
  const raw = Object.values(scores).reduce((a, b) => a + b, 0);
  const sub = (component: string, id: string, role: 'supervisor' | 'evaluator', rawScore: number, max: number, rubricScores: Record<string, number> | null = null) => ({
    component: component as never, submitterId: id, submitterName: id, submitterRole: role, counted: true, rawScore, rubricMax: max, rubricScores,
  });
  const submissions = [
    sub('report', 'sup', 'supervisor', raw, 39, scores),
    sub('report', 'e1', 'evaluator', raw, 39, scores),
    sub('presentation', 'sup', 'supervisor', 36, 45),
    sub('presentation', 'e1', 'evaluator', 36, 45),
    sub('poster', 'sup', 'supervisor', 9, 12),
    sub('poster', 'e1', 'evaluator', 9, 12),
    sub('peer', 'sup', 'supervisor', 4, 5),
    sub('weeklyJournal', 'sup', 'supervisor', 8, 10),
  ];
  const evaluated = evaluateScheme(scheme, {
    studentAccountId: 'st',
    supervisorId: 'sup',
    chosenEvaluators: { report: ['e1'], presentation: ['e1'], poster: ['e1'] },
    marks: submissions.map((x) => ({ component: x.component, submitterId: x.submitterId, submitterRole: x.submitterRole, rawScore: x.rawScore, rubricMax: x.rubricMax })),
  });
  const member: MemberGrade = { studentAccountId: 'st', studentId: '1', name: 'S', email: null, submissions, ...evaluated };
  const group: GroupGrades = {
    groupId: 'g', track: 'C', groupNumber: 1, projectTitle: 'P', supervisorName: 'sup', schemeName: 'C', schemeVersion: 1, componentNodeIds: [], chosenAggregate: {},
    evaluatorRules: { report: { mode: 'pick', k: null, how: 'mean' }, presentation: { mode: 'pick', k: null, how: 'mean' }, poster: { mode: 'all', k: null, how: 'mean' } },
    members: [member],
  };
  const file = buildCourseFileData({ track: 'C', graph: scheme, outcomes: cos, groups: [group] });
  const row = file.rows[0];
  check('course file columns include the poster (out of 20)', file.columns.map((c) => [c.component, c.max]), [['report', 40], ['presentation', 25], ['poster', 20], ['peer', 5], ['weeklyJournal', 10]]);
  // Poster 9/12 from both -> 37.5 on 50 -> 15 of 20. CO5 = report criteria 6 + poster 15.
  check('poster column', row.components.poster_blend, 15);
  check('CO5 = 6 from the report + 15 from the poster', row.co.CO5, 21);
  check('CO5 out of 26', file.outcomes.find((o) => o.key === 'CO5')?.max, 26);
  check('CO5 per-grader sheet counts the rubric part only (/6)', [file.outcomes.find((o) => o.key === 'CO5')?.sourceMax, row.coGraders.report?.[0]?.values.CO5], [6, 6]);
  check('CO1 from the rubric only (2 + 2 of 6)', row.co.CO1, 4);
  check('CO10 = presentation scaled to 10', row.co.CO10, round2(((evaluated.trace.find((t) => t.nodeId === 'pres_blend')?.value as number) / 25) * 10));
  check('no warnings', file.warnings, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
