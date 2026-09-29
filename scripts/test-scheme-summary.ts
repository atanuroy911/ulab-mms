// The plain-language summary of a grading scheme (lib/schemeSummary.ts).
import { summarizeScheme } from '../lib/schemeSummary';
import { defaultCseScheme, type SchemeGraph } from '../lib/gradingEngine';
import { formulaToBlocks, applyConversion, type GNode, type GEdge } from '../lib/formulaBlocks';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}
const g = (s: SchemeGraph) => ({ nodes: s.nodes, edges: s.edges.map((e) => ({ source: e.source, target: e.target, targetHandle: e.targetHandle })) });
const steps = (s: ReturnType<typeof summarizeScheme>, title: string) => s.parts.find((p) => p.title === title)?.steps.map((x) => x.text);

// ── Default Track A (formulas) ───────────────────────────────────────────────────────────
const A = summarizeScheme(g(defaultCseScheme('A')));
check('headline', A.headline, 'The final score is Report (out of 40), Presentation (out of 45), Peer Mark (0-5) and Weekly Journal (0-10), added together - out of 100 in all, then turned into a letter grade.');
check('four parts with their maximums', A.parts.map((p) => [p.title, p.max]), [['Report (out of 40)', 40], ['Presentation (out of 45)', 45], ['Peer Mark (0-5)', 5], ['Weekly Journal (0-10)', 10]]);
check('report in steps', steps(A, 'Report (out of 40)'), [
  'Take the supervisor’s report mark scaled to 40 marks, then round to 2 decimal places.'.replace('’', "'"),
  "Take the chosen evaluators' average report mark scaled to 40 marks, then round to 2 decimal places.",
  'Add 60% of step 1 and 40% of step 2, then round to 2 decimal places.',
]);
check('presentation: blend on 50, round, cap at 45', steps(A, 'Presentation (out of 45)'), [
  "Add 60% of (the supervisor's presentation mark ÷ 45) and 40% of (the chosen evaluators' average presentation mark ÷ 45).",
  'Take step 1 × 50, then round to 2 decimal places, then cap it at 45 (no more than 45).',
]);
check('a plain mark', steps(A, 'Peer Mark (0-5)'), ["Take the supervisor's peer mark as it is."]);
check('what each part reads', A.parts[0].uses, ["the supervisor's report mark (out of 33)", "the chosen evaluators' average report mark (out of 33)"]);
check('bands, highest first', [A.bands[0], A.bands.at(-1)], [{ letter: 'A+', min: 98 }, { letter: 'F', min: 0 }]);
check('total out of 100', A.totalMax, 100);
check('notes: evaluators per group, supervisor change, rounding', A.notes.length, 3);
check('every step names its block', A.parts.every((p) => p.steps.every((s) => s.nodeId && s.label)), true);

// ── Default Track C: poster and the change of scale ────────────────────────────────────────
const C = summarizeScheme(g(defaultCseScheme('C')));
check('C: five parts', C.parts.map((p) => p.max), [40, 25, 20, 5, 10]);
check('C: presentation turned from 50 into 25', steps(C, 'Presentation (out of 25)')?.at(-1), 'Take step 3 turned from out of 50 into out of 25, then round to 2 decimal places.');
check('C: poster reads the poster mark out of 12', C.parts.find((p) => p.title.startsWith('Poster'))?.uses, ["the supervisor's poster mark (out of 12)", "the chosen evaluators' average poster mark (out of 12)"]);

// ── The same scheme built from maths blocks (as the live Grading A v2/v3 are) ───────────────
{
  let nodes: GNode[] = defaultCseScheme('A').nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data as Record<string, unknown> }));
  let edges: GEdge[] = defaultCseScheme('A').edges.map((e) => ({ id: e.id, source: e.source, target: e.target, input: e.targetHandle || 'in' }));
  for (const id of ['report_blend', 'pres_blend']) {
    const f = nodes.find((n) => n.id === id)!;
    const conv = formulaToBlocks(f, Object.fromEntries(edges.filter((e) => e.target === id).map((e) => [e.input, e.source])));
    if (!conv.ok) throw new Error(conv.reason);
    ({ nodes, edges } = applyConversion(nodes, edges, conv, id));
  }
  const B = summarizeScheme({ nodes, edges: edges.map((e) => ({ source: e.source, target: e.target, targetHandle: e.input })) });
  const max = Object.fromEntries(B.parts.map((p) => [p.title, p.max]));
  check('blocks: same four parts, same maximums', max, { 'Peer Mark (0-5)': 5, 'Weekly Journal (0-10)': 10, 'Report (out of 40)': 40, 'Presentation (out of 45)': 45 });
  check('blocks: same total', B.totalMax, 100);
  check('blocks: chains of single blocks read as one step each', steps(B, 'Report (out of 40)'), [
    "Take the supervisor's report mark scaled to 40 marks, then round to 2 decimal places, then take 60% of it.",
    "Take the chosen evaluators' average report mark scaled to 40 marks, then round to 2 decimal places, then take 40% of it.",
    'Add step 1 and step 2, then round to 2 decimal places.',
  ]);
  check('blocks: presentation ends capped at 45', steps(B, 'Presentation (out of 45)')?.at(-1), 'Add step 1 and step 2, then multiply by 50, then round to 2 decimal places, then cap it at 45.');
  check('blocks: no block describes itself by its own label', B.parts.every((p) => p.steps.every((s) => !s.text.includes(`“${s.label}”`))), true);
}

// ── Other shapes ────────────────────────────────────────────────────────────────────────────
const src = (id: string, component: string, scope: string, extra: Record<string, unknown> = {}) => ({ id, type: 'source', data: { label: id, component, scope, aggregate: 'mean', normalize: false, ...extra } });
{
  const s = summarizeScheme({
    nodes: [
      src('sup', 'report', 'supervisor', { normalize: true, rubricMaxOverride: 33 }),
      { id: 'scaled', type: 'scale', data: { label: 'Report', factor: 40 } },
      src('peer', 'peer', 'supervisor'),
      { id: 'bonus', type: 'constant', data: { label: 'Bonus', value: 2 } },
      { id: 'weighted', type: 'sum', data: { label: 'Total', weights: { r: 0.5, p: 2, b: 1 } } },
      { id: 'best', type: 'op', data: { label: 'Best of', op: 'highest' } },
      src('loose', 'poster', 'allEvaluator'),
      { id: 'out', type: 'output', data: { label: 'Final' } },
    ],
    edges: [
      { source: 'sup', target: 'scaled' },
      { source: 'scaled', target: 'weighted', targetHandle: 'r' },
      { source: 'peer', target: 'weighted', targetHandle: 'p' },
      { source: 'bonus', target: 'weighted', targetHandle: 'b' },
      { source: 'weighted', target: 'out' },
    ],
  });
  check('weighted sum: each part with its weight', s.parts.map((p) => p.title), ['Report', 'peer', 'Bonus']);
  check('scale block on a fraction reads as scaled to N marks', s.parts[0].steps[0].text, "Take the supervisor's report mark scaled to 40 marks.");
  check('a constant part', s.parts[2].steps[0].text, 'Always 2.');
  check('no letter bands: headline says so', s.headline.endsWith('in all.'), true);
  check('blocks not connected to the grade are called out', s.notes[0], 'These blocks are not connected to the final grade, so they have no effect: “Best of” and “loose”.');
}
{
  const s = summarizeScheme({
    nodes: [src('a', 'peer', 'supervisor'), src('b', 'weeklyJournal', 'supervisor'), { id: 'f', type: 'formula', data: { label: 'F', expression: 'if(a >= 3, a + b, clamp(b, 0, 5))' } }, { id: 'o', type: 'output', data: {} }],
    edges: [{ source: 'a', target: 'f', targetHandle: 'a' }, { source: 'b', target: 'f', targetHandle: 'b' }, { source: 'f', target: 'o' }],
  });
  check('if / clamp formulas become short steps', s.parts[0].steps.map((x) => x.text), [
    "Add the supervisor's peer mark and the supervisor's weekly journal mark.",
    "Keep the supervisor's weekly journal mark between 0 and 5.",
    "If the supervisor's peer mark is at least 3, use step 1; otherwise use step 2.",
  ]);
}
{
  const s = summarizeScheme({ nodes: [src('a', 'peer', 'supervisor'), { id: 'f', type: 'formula', data: { label: 'Broken', expression: 'a +' } }, { id: 'o', type: 'output', data: {} }], edges: [{ source: 'a', target: 'f', targetHandle: 'a' }, { source: 'f', target: 'o' }] });
  check('a broken formula says so instead of crashing', s.parts[0].steps[0].text, 'Work out the formula a + (it has an error).');
}
check('no Final Grade block', summarizeScheme({ nodes: [src('a', 'peer', 'supervisor')], edges: [] }).headline, 'This scheme has no Final Grade block yet, so it does not produce a grade.');
check('nothing connected to it', summarizeScheme({ nodes: [{ id: 'o', type: 'output', data: {} }], edges: [] }).headline, 'Nothing is connected to the Final Grade yet.');
check('evaluator best / count wording', summarizeScheme({ nodes: [src('e', 'report', 'allEvaluator', { aggregate: 'max' }), { id: 'o', type: 'output', data: {} }], edges: [{ source: 'e', target: 'o' }] }).parts[0].uses, ["all evaluators' best report mark"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
