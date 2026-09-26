/**
 * Who marks what comes from the ACTIVE grading scheme's source blocks: adding a block adds a
 * marking task for that grader, removing one takes it away, and each keeps the right scale.
 */
import { planFromGraph, defaultMarkingPlan } from '../lib/capstoneMarkingPlan';
import { defaultCseScheme } from '../lib/gradingEngine';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

const components = (reqs: Array<{ component: string }>) => reqs.map((r) => r.component);

// The department's starting scheme: supervisor marks all four, evaluators report + presentation.
const cse = planFromGraph(defaultCseScheme('A'), 'A');
check('CSE scheme: supervisor tasks', components(cse.supervisor), ['report', 'presentation', 'peer', 'weeklyJournal']);
check('CSE scheme: evaluator tasks', components(cse.evaluator), ['report', 'presentation']);
check('4098A report is out of 33', cse.supervisor.find((r) => r.component === 'report')?.max, 33);
check('4098B report is out of 42', planFromGraph(defaultCseScheme('B'), 'B').evaluator.find((r) => r.component === 'report')?.max, 42);
check('presentation is out of 45', cse.evaluator.find((r) => r.component === 'presentation')?.max, 45);

// It matches the pre-scheme default exactly, so pinning the standard scheme changes nothing.
const def = defaultMarkingPlan('A');
check('default supervisor tasks', components(def.supervisor), components(cse.supervisor));
check('default evaluator tasks', components(def.evaluator), components(cse.evaluator));

// Remove the supervisor's presentation block: the supervisor no longer marks presentation.
const graph = defaultCseScheme('A');
const withoutSupPresentation = {
  nodes: graph.nodes.filter((n) => !(n.type === 'source' && n.data.component === 'presentation' && n.data.scope === 'supervisor')),
};
const noSup = planFromGraph(withoutSupPresentation, 'A');
check('removed block: supervisor no longer marks presentation', components(noSup.supervisor), ['report', 'peer', 'weeklyJournal']);
check('removed block: evaluators still do', components(noSup.evaluator), ['report', 'presentation']);

// Add a poster block for the supervisor with its own scale: a new task appears.
const withPoster = {
  nodes: [
    ...graph.nodes,
    { id: 'poster', type: 'source', position: { x: 0, y: 0 }, data: { component: 'poster', scope: 'supervisor', rubricMaxOverride: 20 } },
  ],
};
const poster = planFromGraph(withPoster, 'A');
check('added block: supervisor marks poster', components(poster.supervisor).includes('poster'), true);
check('added block keeps its scale', poster.supervisor.find((r) => r.component === 'poster')?.max, 20);
check('added block: evaluators unaffected', components(poster.evaluator), ['report', 'presentation']);

// Evaluator-scoped blocks, chosen or all, both mean "evaluators mark this".
const allEval = planFromGraph(
  { nodes: [{ type: 'source', data: { component: 'poster', scope: 'allEvaluator' } }] },
  'A'
);
check('allEvaluator scope -> evaluator task', components(allEval.evaluator), ['poster']);
check('poster default scale is 12 (the 4098C poster sheet)', allEval.evaluator[0]?.max, 12);

// A rubric component ignores a stray override - its rubric defines the scale.
const override = planFromGraph(
  { nodes: [{ type: 'source', data: { component: 'presentation', scope: 'chosenEvaluator', rubricMaxOverride: 50 } }] },
  'A'
);
check('rubric scale wins over override', override.evaluator[0]?.max, 45);

// Non-source blocks and unknown components are ignored.
check(
  'ignores non-source and unknown blocks',
  planFromGraph({ nodes: [{ type: 'sum', data: {} }, { type: 'source', data: { component: 'nope', scope: 'supervisor' } }] }, 'A'),
  { supervisor: [], evaluator: [] }
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
