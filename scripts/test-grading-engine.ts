import { validateScheme, evaluateScheme, defaultCseScheme } from '../lib/gradingEngine';
import type { StudentContext, MarkInput } from '../lib/gradingEngine';

let pass = 0;
let fail = 0;

function check(label: string, got: unknown, expected: unknown) {
  const ok = typeof got === 'number' && typeof expected === 'number'
    ? Math.abs(got - expected) < 0.011
    : JSON.stringify(got) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

// ── The default scheme must be valid out of the box ──────────────────────────────────────
for (const track of ['A', 'B', 'C'] as const) {
  const issues = validateScheme(defaultCseScheme(track));
  check(`default scheme ${track} validates`, issues.map((i) => i.message), []);
}

// ── Evaluate a realistic CSE4098A student ────────────────────────────────────────────────
const SUP = 'sup1';
const EV_CHOSEN_A = 'evA';
const EV_CHOSEN_B = 'evB';
const EV_IGNORED = 'evZ';

const marks: MarkInput[] = [
  // Report, rubric max 33
  { component: 'report', submitterId: SUP, submitterRole: 'supervisor', rawScore: 30, rubricMax: 33 },
  { component: 'report', submitterId: EV_CHOSEN_A, submitterRole: 'evaluator', rawScore: 27, rubricMax: 33 },
  { component: 'report', submitterId: EV_CHOSEN_B, submitterRole: 'evaluator', rawScore: 24, rubricMax: 33 },
  // This evaluator submitted but was NOT chosen for report - must not affect the score.
  { component: 'report', submitterId: EV_IGNORED, submitterRole: 'evaluator', rawScore: 0, rubricMax: 33 },
  // Presentation, rubric max 45
  { component: 'presentation', submitterId: SUP, submitterRole: 'supervisor', rawScore: 40, rubricMax: 45 },
  { component: 'presentation', submitterId: EV_CHOSEN_A, submitterRole: 'evaluator', rawScore: 38, rubricMax: 45 },
  { component: 'presentation', submitterId: EV_CHOSEN_B, submitterRole: 'evaluator', rawScore: 36, rubricMax: 45 },
  // Peer and journal are already on their final scale (not normalised).
  { component: 'peer', submitterId: SUP, submitterRole: 'supervisor', rawScore: 4, rubricMax: 5 },
  { component: 'weeklyJournal', submitterId: SUP, submitterRole: 'supervisor', rawScore: 9, rubricMax: 10 },
];

const ctx: StudentContext = {
  studentAccountId: 's1',
  marks,
  supervisorId: SUP,
  chosenEvaluators: {
    report: [EV_CHOSEN_A, EV_CHOSEN_B],
    presentation: [EV_CHOSEN_A, EV_CHOSEN_B],
  },
};

const result = evaluateScheme(defaultCseScheme('A'), ctx);

// Report:  sup 30/33 = .90909, chosen eval mean (27+24)/2 = 25.5 /33 = .77273
//          40 * (0.6*.90909 + 0.4*.77273) = 40 * (.545454 + .309091) = 40 * .854545 = 34.18
const expectedReport = 34.18;
// Pres:    sup 40/45 = .88889, chosen eval mean 37/45 = .82222
//          45 * (0.6*.88889 + 0.4*.82222) = 45 * (.533333 + .328889) = 45 * .862222 = 38.80
const expectedPres = 38.8;
const expectedTotal = expectedReport + expectedPres + 4 + 9; // 85.98

const byId = Object.fromEntries(result.trace.map((t) => [t.nodeId, t.value]));
check('report component', byId.report_blend, expectedReport);
check('presentation component', byId.pres_blend, expectedPres);
check('peer passes through raw', byId.peer, 4);
check('journal passes through raw', byId.journal, 9);
check('total', result.score, expectedTotal);
check('letter grade (85.98 -> A)', result.letter, 'A');
check('nothing missing', result.missingComponents, []);

// The unchosen evaluator's 0 must have been excluded - if it leaked in, the report mean
// would drop to (27+24+0)/3 and the total would fall well below this.
check('unchosen evaluator excluded', byId.report_blend! > 34, true);

// ── Per-component evaluator choice actually differs ──────────────────────────────────────
// Same marks, but only EV_CHOSEN_A counts for report while both count for presentation.
const splitCtx: StudentContext = {
  ...ctx,
  chosenEvaluators: { report: [EV_CHOSEN_A], presentation: [EV_CHOSEN_A, EV_CHOSEN_B] },
};
const splitResult = evaluateScheme(defaultCseScheme('A'), splitCtx);
const splitById = Object.fromEntries(splitResult.trace.map((t) => [t.nodeId, t.value]));
// Report eval is now just 27/33 = .81818 -> 40*(.545454+.327273) = 34.91
check('report honours its own evaluator choice', splitById.report_blend, 34.91);
check('presentation unchanged by report choice', splitById.pres_blend, expectedPres);

// ── Missing marks degrade gracefully instead of throwing ─────────────────────────────────
const emptyCtx: StudentContext = {
  studentAccountId: 's2',
  marks: [],
  supervisorId: SUP,
  chosenEvaluators: {},
};
const emptyResult = evaluateScheme(defaultCseScheme('A'), emptyCtx);
check('ungraded student scores 0', emptyResult.score, 0);
check('ungraded student gets F', emptyResult.letter, 'F');
check(
  'ungraded student reports every missing component',
  [...emptyResult.missingComponents].sort(),
  ['peer', 'presentation', 'report', 'weeklyJournal']
);

// ── Validation catches broken schemes ────────────────────────────────────────────────────
check('empty scheme rejected', validateScheme({ nodes: [], edges: [] }).length > 0, true);

const noOutput = defaultCseScheme('A');
noOutput.nodes = noOutput.nodes.filter((n) => n.type !== 'output');
noOutput.edges = noOutput.edges.filter((e) => e.target !== 'final');
check('scheme with no output rejected', validateScheme(noOutput).some((i) => i.message.includes('Final Grade')), true);

const cyclic = defaultCseScheme('A');
cyclic.edges.push({ id: 'loop', source: 'final', target: 'total', targetHandle: 'loopback' });
check('cyclic scheme rejected', validateScheme(cyclic).some((i) => i.message.includes('loop')), true);

const badFormula = defaultCseScheme('A');
badFormula.nodes.find((n) => n.id === 'report_blend')!.data.expression = 'process.env.SECRET';
check('injection in formula rejected', validateScheme(badFormula).length > 0, true);

const danglingVar = defaultCseScheme('A');
danglingVar.nodes.find((n) => n.id === 'report_blend')!.data.expression = 'sup + ev + mystery';
check(
  'formula referencing an unconnected input rejected',
  validateScheme(danglingVar).some((i) => i.message.includes('mystery')),
  true
);

const twoOutputs = defaultCseScheme('A');
twoOutputs.nodes.push({ id: 'final2', type: 'output', position: { x: 0, y: 0 }, data: {} });
twoOutputs.edges.push({ id: 'e11', source: 'bands', target: 'final2', targetHandle: 'in' });
check('two output nodes rejected', validateScheme(twoOutputs).some((i) => i.message.includes('exactly one')), true);

// Coordinator's per-group "Average / Best" for the chosen evaluators. Presentation evaluator
// marks above are 38 and 36 of 45: average = 37/45, best = 38/45. Only the chosen-evaluator
// block changes; the supervisor's block is untouched.
const presentationChosen = (r: ReturnType<typeof evaluateScheme>) =>
  r.trace.find((t) => t.type === 'source' && /Presentation.*Chosen/i.test(t.label))?.value;
const presentationSupervisor = (r: ReturnType<typeof evaluateScheme>) =>
  r.trace.find((t) => t.type === 'source' && /Presentation.*Supervisor/i.test(t.label))?.value;
const avg = evaluateScheme(defaultCseScheme('A'), ctx);
const best = evaluateScheme(defaultCseScheme('A'), { ...ctx, chosenAggregate: { presentation: 'max' } });
const explicitAvg = evaluateScheme(defaultCseScheme('A'), { ...ctx, chosenAggregate: { presentation: 'mean' } });
check('average (default) of chosen presentation', presentationChosen(avg), 37 / 45);
check('explicit average matches default', presentationChosen(explicitAvg), 37 / 45);
check('best of chosen presentation', presentationChosen(best), 38 / 45);
check('supervisor block unaffected by best', presentationSupervisor(best), presentationSupervisor(avg));
check('best raises the final score', (best.score ?? 0) > (avg.score ?? 0), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
