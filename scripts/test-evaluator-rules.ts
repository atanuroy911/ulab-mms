// Which evaluator marks count - all / top K / picked - from the stored group fields through
// the grading engine. Pure: no database.
import { evaluateScheme, defaultCseScheme, topKMarks } from '../lib/gradingEngine';
import type { StudentContext, MarkInput } from '../lib/gradingEngine';
import { evaluatorRule } from '../models/CapstoneGroup';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  const ok =
    typeof got === 'number' && typeof expected === 'number' ? Math.abs(got - expected) < 1e-6 : JSON.stringify(got) === JSON.stringify(expected);
  if (ok) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

const ev = (id: string, raw: number, max: number | null = 45, component: MarkInput['component'] = 'presentation'): MarkInput => ({
  component,
  submitterId: id,
  submitterRole: 'evaluator',
  rawScore: raw,
  rubricMax: max,
});

// ── topKMarks ──────────────────────────────────────────────────────────────────────────
const four = [ev('a', 30), ev('b', 42), ev('c', 36), ev('d', 39)];
check('top 2 are the two highest', topKMarks(four, 2).map((m) => m.submitterId), ['b', 'd']);
check('top 1 is the best', topKMarks(four, 1).map((m) => m.submitterId), ['b']);
check('K larger than the marks keeps them all', topKMarks(four, 9).length, 4);
check('K of 0 keeps none', topKMarks(four, 0).length, 0);
check('fractional K rounds down', topKMarks(four, 2.9).length, 2);
check('ties broken by evaluator id (stable)', topKMarks([ev('z', 40), ev('m', 40), ev('a', 40)], 2).map((m) => m.submitterId), ['a', 'm']);
check('ranked on each mark’s own scale', topKMarks([ev('x', 30, 50), ev('y', 28, 33)], 1).map((m) => m.submitterId), ['y']);
check('marks without a max rank on the raw score', topKMarks([ev('p', 4, null), ev('q', 5, null)], 1).map((m) => m.submitterId), ['q']);
check('input is not reordered', four.map((m) => m.submitterId), ['a', 'b', 'c', 'd']);

// ── evaluatorRule: reading what a group stored ─────────────────────────────────────────
const active = ['e1', 'e2', 'e3'];
check('nothing stored -> all, averaged', evaluatorRule({}, active), { mode: 'all', counted: active, k: null, how: 'mean' });
check('nothing stored, best -> all, best', evaluatorRule({ how: 'max' }, active).how, 'max');
check('a picked list -> pick', evaluatorRule({ chosen: ['e1', 'e3'] }, active), { mode: 'pick', counted: ['e1', 'e3'], k: null, how: 'mean' });
check('picked but since unassigned -> falls back to all', evaluatorRule({ chosen: ['gone'] }, active).mode, 'all');
check('picked list drops unassigned ones', evaluatorRule({ chosen: ['e1', 'gone', 'e2'] }, active).counted, ['e1', 'e2']);
check('top K -> every active evaluator in the running', evaluatorRule({ topK: 2 }, active), { mode: 'topK', counted: active, k: 2, how: 'mean' });
check('top K wins over a stale picked list', evaluatorRule({ topK: 2, chosen: ['e1', 'e2'] }, active).mode, 'topK');
check('top K ignores "best" (always averages its K)', evaluatorRule({ topK: 2, how: 'max' }, active).how, 'mean');
check('top K larger than the panel is clamped', evaluatorRule({ topK: 5 }, active).k, 3);
check('top K after evaluators left is clamped', evaluatorRule({ topK: 3 }, ['e1']).k, 1);
check('top K of 0 or null is off', [evaluatorRule({ topK: 0 }, active).mode, evaluatorRule({ topK: null }, active).mode], ['all', 'all']);
check('no evaluators at all', evaluatorRule({}, []).counted, []);

// ── Through the grading engine (default CSE scheme) ────────────────────────────────────
const scheme = defaultCseScheme('A');
const SUP = 'sup';
const traceValue = (ctx: StudentContext, label: string) => {
  const r = evaluateScheme(scheme, ctx);
  return r.trace.find((t) => t.label === label)?.value;
};
const PRES = 'Presentation — Chosen Evaluators';
const REP = 'Report — Chosen Evaluators';

const base = (marks: MarkInput[], extra: Partial<StudentContext> = {}): StudentContext => ({
  studentAccountId: 's',
  supervisorId: SUP,
  marks: [
    { component: 'presentation', submitterId: SUP, submitterRole: 'supervisor', rawScore: 40, rubricMax: 45 },
    { component: 'report', submitterId: SUP, submitterRole: 'supervisor', rawScore: 30, rubricMax: 33 },
    ...marks,
  ],
  chosenEvaluators: { presentation: ['e1', 'e2', 'e3'], report: ['e1', 'e2', 'e3'] },
  ...extra,
});
const pres = [ev('e1', 27), ev('e2', 45), ev('e3', 36)];

check('the scheme has a chosen-evaluator presentation input', traceValue(base(pres), PRES) !== undefined, true);
check('all, average', traceValue(base(pres), PRES), (27 + 45 + 36) / 3 / 45);
check('all, best', traceValue(base(pres, { chosenAggregate: { presentation: 'max' } }), PRES), 45 / 45);
check('top 2 averages the two highest', traceValue(base(pres, { evaluatorTopK: { presentation: 2 } }), PRES), (45 + 36) / 2 / 45);
check('top 1 equals best', traceValue(base(pres, { evaluatorTopK: { presentation: 1 } }), PRES), 1);
check('top 3 of 3 equals all', traceValue(base(pres, { evaluatorTopK: { presentation: 3 } }), PRES), (27 + 45 + 36) / 3 / 45);
check('top K ignores a stored "best"', traceValue(base(pres, { evaluatorTopK: { presentation: 2 }, chosenAggregate: { presentation: 'max' } }), PRES), (45 + 36) / 2 / 45);
check('top K on presentation leaves report alone', traceValue(base([...pres, ev('e1', 33, 33, 'report'), ev('e2', 0, 33, 'report')], { evaluatorTopK: { presentation: 1 } }), REP), 16.5 / 33);
check('top K per component', traceValue(base([ev('e1', 33, 33, 'report'), ev('e2', 0, 33, 'report')], { evaluatorTopK: { report: 1 } }), REP), 1);
check('top K with only one mark in', traceValue(base([ev('e2', 30)], { evaluatorTopK: { presentation: 2 } }), PRES), 30 / 45);
check('top K with no marks in -> 0', traceValue(base([], { evaluatorTopK: { presentation: 2 } }), PRES), 0);
check('top K reads only evaluators in the pool', traceValue(base([...pres, ev('outsider', 45)], { evaluatorTopK: { presentation: 1 }, chosenEvaluators: { presentation: ['e1', 'e3'] } }), PRES), 36 / 45);
check('picked evaluators only', traceValue(base([...pres], { chosenEvaluators: { presentation: ['e1', 'e3'] } }), PRES), (27 + 36) / 2 / 45);
check('picked, best', traceValue(base([...pres], { chosenEvaluators: { presentation: ['e1', 'e3'] }, chosenAggregate: { presentation: 'max' } }), PRES), 36 / 45);
check('supervisor input never changes with the rule', traceValue(base(pres, { evaluatorTopK: { presentation: 1 } }), 'Presentation — Supervisor'), 40 / 45);

// Each student gets their own top K: different evaluators for different students.
const s1 = evaluateScheme(scheme, base([ev('e1', 44), ev('e2', 20), ev('e3', 40)], { evaluatorTopK: { presentation: 2 } }));
const s2 = evaluateScheme(scheme, base([ev('e1', 20), ev('e2', 44), ev('e3', 40)], { evaluatorTopK: { presentation: 2 } }));
check('per student: same marks by different evaluators -> same input', s1.trace.find((t) => t.label === PRES)?.value, s2.trace.find((t) => t.label === PRES)?.value);
check('...and the same final score', s1.score, s2.score);

// The final grade moves the way the rule says.
const allScore = evaluateScheme(scheme, base(pres)).score as number;
const topScore = evaluateScheme(scheme, base(pres, { evaluatorTopK: { presentation: 2 } })).score as number;
const bestScore = evaluateScheme(scheme, base(pres, { chosenAggregate: { presentation: 'max' } })).score as number;
check('top 2 of these marks raises the grade over all', topScore > allScore, true);
check('best raises it at least as much as top 2', bestScore >= topScore, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
