/**
 * Plain-language math blocks, and converting formulas to blocks and back. Every conversion
 * must give exactly the same numbers, including the department's workbook formulas.
 */
import { BLOCKS, BLOCK_BY_OP, evaluateBlock, blockIssues } from '../lib/gradingBlocks';
import { formulaToBlocks, blocksToFormula, applyConversion, sameResult, evaluateSubgraph, type GNode, type GEdge } from '../lib/formulaBlocks';
import { defaultCseScheme, evaluateScheme, validateScheme, type MarkInput } from '../lib/gradingEngine';
import { evaluateExpression } from '../lib/gradingExpression';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  const ok = typeof expected === 'number' && typeof got === 'number' ? Math.abs(got - expected) < 1e-9 : JSON.stringify(got) === JSON.stringify(expected);
  if (ok) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

// ── Each block does what its sentence says ────────────────────────────────────────────
const ev = (op: string, data: Record<string, unknown>, named: Record<string, number>, all: number[] = Object.values(named)) =>
  evaluateBlock(op, data, named, all);
check('add', ev('add', {}, {}, [1, 2, 3.5]), 6.5);
check('subtract: start with - take away', ev('subtract', {}, { a: 10, b: 3 }), 7);
check('multiply', ev('multiply', {}, {}, [2, 3, 4]), 24);
check('divide', ev('divide', {}, { a: 9, b: 3 }), 3);
check('divide by zero is 0', ev('divide', {}, { a: 9, b: 0 }), 0);
check('take 60% of', ev('percentOf', { percent: 60 }, { in: 50 }), 30);
check('multiply by', ev('multiplyBy', { by: 2.5 }, { in: 4 }), 10);
check('divide by', ev('divideBy', { by: 4 }, { in: 10 }), 2.5);
check('add a number', ev('addNumber', { n: -2 }, { in: 10 }), 8);
check('round to 2 places', ev('round', { places: 2 }, { in: 34.18181 }), 34.18);
check('round to whole', ev('round', { places: 0 }, { in: 2.5 }), 3);
check('round up', ev('roundUp', {}, { in: 2.1 }), 3);
check('round down', ev('roundDown', {}, { in: 2.9 }), 2);
check('cap at 45', ev('atMost', { max: 45 }, { in: 47.2 }), 45);
check('cap leaves smaller values', ev('atMost', { max: 45 }, { in: 41 }), 41);
check('at least 0', ev('atLeast', { min: 0 }, { in: -3 }), 0);
check('keep between', ev('between', { min: 0, max: 10 }, { in: 12 }), 10);
check('average', ev('average', {}, {}, [36, 42, 33]), 37);
check('highest', ev('highest', {}, {}, [36, 42, 33]), 42);
check('lowest', ev('lowest', {}, {}, [36, 42, 33]), 33);
check('change out of 33 to out of 40', ev('rescale', { from: 33, to: 40 }, { in: 30 }), (30 * 40) / 33);
check('if at least 50 then / otherwise', ev('ifAtLeast', { threshold: 50 }, { value: 55, then: 1, else: 0 }), 1);
check('if below threshold uses otherwise', ev('ifAtLeast', { threshold: 50 }, { value: 49.99, then: 1, else: 0 }), 0);
check('missing param uses its default', ev('round', {}, { in: 1.23456 }), 1.23);
check('every block has a sentence', BLOCKS.every((b) => typeof b.sentence({ percent: 60, places: 2, max: 45, min: 0, by: 2, n: 1, from: 33, to: 40, threshold: 50 }) === 'string'), true);

// ── Validation speaks plainly ─────────────────────────────────────────────────────────
check('subtract needs both slots', blockIssues('subtract', {}, ['a']).length, 1);
check('a slot takes one input', blockIssues('percentOf', {}, ['in', 'in']).length, 1);
check('many-input block needs one', blockIssues('add', {}, []).length, 1);
check('places must be whole', blockIssues('round', { places: 1.5 }, ['in']).length, 1);
check('unknown block', blockIssues('explode', {}, []).length, 1);
check('valid block has no issues', blockIssues('divide', {}, ['a', 'b']), []);

// ── formula -> blocks -> formula, on every formula the department uses ────────────────
const src = (id: string): GNode => ({ id, type: 'source', position: { x: 0, y: 0 }, data: { label: id } });
function roundTrip(expression: string, label: string) {
  const vars = [...new Set(expression.match(/[A-Za-z_]\w*(?!\s*\()/g) || [])];
  const sources = vars.map(src);
  const formula: GNode = { id: 'f', type: 'formula', position: { x: 800, y: 200 }, data: { label: 'F', expression } };
  const out: GNode = { id: 'out', type: 'output', position: { x: 1100, y: 200 }, data: {} };
  const nodes = [...sources, formula, out];
  const edges: GEdge[] = [...vars.map((v) => ({ id: `e_${v}`, source: v, target: 'f', input: v })), { id: 'e_out', source: 'f', target: 'out', input: 'in' }];

  const toBlocks = formulaToBlocks(formula, Object.fromEntries(vars.map((v) => [v, v])));
  check(`${label}: converts to blocks`, toBlocks.ok, true);
  if (!toBlocks.ok) return null;
  const g1 = applyConversion(nodes, edges, toBlocks, 'f');
  check(`${label}: formula block removed`, g1.nodes.some((n) => n.id === 'f'), false);
  check(`${label}: output now reads the result block`, g1.edges.some((e) => e.target === 'out' && e.source === toBlocks.resultNodeId), true);
  check(`${label}: blocks give the same result`, sameResult({ nodes, edges, rootId: 'out' }, { ...g1, rootId: 'out' }, vars), true);
  check(`${label}: only blocks and numbers created`, toBlocks.addNodes.every((n) => n.type === 'op' || n.type === 'constant'), true);

  const back = blocksToFormula(g1.nodes, g1.edges, toBlocks.resultNodeId);
  check(`${label}: converts back to a formula`, back.ok, true);
  if (!back.ok) return null;
  const g2 = applyConversion(g1.nodes, g1.edges, back);
  check(`${label}: back to one formula block`, g2.nodes.filter((n) => n.type === 'formula').length, 1);
  check(`${label}: no math blocks left`, g2.nodes.filter((n) => n.type === 'op').length, 0);
  check(`${label}: round trip gives the same result`, sameResult({ nodes, edges, rootId: 'out' }, { ...g2, rootId: 'out' }, vars), true);
  return { toBlocks, back };
}

const scheme = defaultCseScheme('A');
const formulas = scheme.nodes.filter((n) => n.type === 'formula').map((n) => String(n.data.expression));
check('default scheme has the workbook formulas', formulas.length, 2);
for (const f of formulas) roundTrip(f, f);
for (const f of [
  'a - (b - c)',
  'a / (b * c)',
  '-a + 2',
  '(a + b) * c',
  '(sup * 40) / 33',
  'max(a, b, c)',
  'min(a, b)',
  'min(a, 10, 20)',
  'clamp(a, 0, 10)',
  'if(total >= 50, total, 0)',
  'floor(a) + ceil(b)',
  'a + a',
  '(a + b + c) / 3',
  'a * 0.6 + b * 0.4',
  '2 * a * 3',
  'a - 5',
  '5 - a',
  'round(a)',
  'a',
]) roundTrip(f, f);

// The presentation formula reads as plain steps.
const pres = roundTrip('min(45, round(50 * (0.6 * sup + 0.4 * ev), 2))', 'presentation (steps)');
check('presentation: plain steps', pres?.toBlocks.ok ? pres.toBlocks.steps : null, [
  'Take 60% of',
  'Take 40% of',
  'Add together',
  'Multiply by 50',
  'Round to 2 decimal places',
  'Cap at 45',
]);
const rescale = formulaToBlocks({ id: 'f', type: 'formula', position: { x: 0, y: 0 }, data: { expression: '(mark * 40) / 33' } }, { mark: 'mark' });
check('(mark * 40) / 33 reads as a change of "out of"', rescale.ok ? rescale.steps : null, ['Change "out of 33" to "out of 40"']);

// ── Unsupported parts are refused with guidance, never half-converted ────────────────
for (const f of ['abs(a)', 'a ^ 2', 'a % 2', 'if(a > 3, b, c)', 'sqrt(a)', 'round(a, b)']) {
  const r = formulaToBlocks({ id: 'f', type: 'formula', position: { x: 0, y: 0 }, data: { expression: f } }, { a: 'a', b: 'b', c: 'c' });
  check(`${f}: refused`, r.ok, false);
  check(`${f}: says why and what to do`, !r.ok && r.reason.length > 0 && r.guidance.length > 0, true);
}
const broken = formulaToBlocks({ id: 'f', type: 'formula', position: { x: 0, y: 0 }, data: { expression: 'a +' } }, { a: 'a' });
check('broken formula: refused', broken.ok, false);
const unwired = formulaToBlocks({ id: 'f', type: 'formula', position: { x: 0, y: 0 }, data: { expression: 'a + b' } }, { a: 'a' });
check('formula using an unconnected name: refused', unwired.ok, false);

// ── blocks -> formula keeps shared blocks as inputs ───────────────────────────────────
{
  // shared = 60% of s; used by BOTH the round block and a separate output-feeding sum.
  const nodes: GNode[] = [
    src('s'),
    { id: 'shared', type: 'op', position: { x: 0, y: 0 }, data: { op: 'percentOf', percent: 60, label: 'Sixty' } },
    { id: 'r', type: 'op', position: { x: 0, y: 0 }, data: { op: 'round', places: 1 } },
    { id: 'other', type: 'op', position: { x: 0, y: 0 }, data: { op: 'add' } },
    { id: 'gb', type: 'gradeBands', position: { x: 0, y: 0 }, data: {} },
  ];
  const edges: GEdge[] = [
    { id: '1', source: 's', target: 'shared', input: 'in' },
    { id: '2', source: 'shared', target: 'r', input: 'in' },
    { id: '3', source: 'shared', target: 'other', input: 'in' },
    { id: '4', source: 'r', target: 'gb', input: 'in' },
  ];
  const r = blocksToFormula(nodes, edges, 'r');
  check('shared block not swallowed', r.ok && !r.removeNodeIds.includes('shared'), true);
  check('shared block becomes the input', r.ok ? r.addNodes[0].data.expression : null, 'round(sixty, 1)');
  const g = r.ok ? applyConversion(nodes, edges, r) : null;
  check('grade bands now read the formula', g?.edges.some((e) => e.target === 'gb' && e.source === (r.ok ? r.resultNodeId : '')), true);
  check('other consumer still reads the shared block', g?.edges.some((e) => e.source === 'shared' && e.target === 'other'), true);
  check('a mark block cannot become a formula', blocksToFormula(nodes, edges, 's').ok, false);
}

// ── A whole scheme in blocks grades exactly like the formula scheme ───────────────────
{
  const g = defaultCseScheme('B');
  let nodes: GNode[] = g.nodes.map((n) => ({ ...n, data: { ...n.data } }));
  let edges: GEdge[] = g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, input: e.targetHandle || 'in' }));
  for (const f of nodes.filter((n) => n.type === 'formula')) {
    const inputs = Object.fromEntries(edges.filter((e) => e.target === f.id).map((e) => [e.input, e.source]));
    const c = formulaToBlocks(f, inputs);
    if (!c.ok) throw new Error(c.reason);
    // Keep the component column's id and label so gradebooks keep their columns.
    const graph = applyConversion(nodes, edges, c, f.id);
    nodes = graph.nodes;
    edges = graph.edges;
  }
  const blocksScheme = {
    nodes: nodes.map((n) => ({ ...n, type: n.type as never })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, targetHandle: e.input })),
  };
  check('scheme in blocks validates', validateScheme(blocksScheme).map((i) => i.message), []);
  check('scheme in blocks has no formulas', blocksScheme.nodes.filter((n) => n.type === 'formula').length, 0);
  // 4098B workbook row 5: total 76.32, B+
  const marks: MarkInput[] = [
    { component: 'report', submitterId: 'S', submitterRole: 'supervisor', rawScore: 37, rubricMax: 42 },
    { component: 'report', submitterId: 'E', submitterRole: 'evaluator', rawScore: 27, rubricMax: 42 },
    { component: 'presentation', submitterId: 'S', submitterRole: 'supervisor', rawScore: 33, rubricMax: 45 },
    ...[38, 36, 36, 24].map((v, i): MarkInput => ({ component: 'presentation', submitterId: `P${i}`, submitterRole: 'evaluator', rawScore: v, rubricMax: 45 })),
    { component: 'peer', submitterId: 'S', submitterRole: 'supervisor', rawScore: 2, rubricMax: 5 },
    { component: 'weeklyJournal', submitterId: 'S', submitterRole: 'supervisor', rawScore: 6, rubricMax: 10 },
  ];
  const ctx = { studentAccountId: 'x', marks, supervisorId: 'S', chosenEvaluators: { report: ['E'], presentation: ['P0', 'P1', 'P2', 'P3'] } };
  const withBlocks = evaluateScheme(blocksScheme, ctx);
  const withFormulas = evaluateScheme(defaultCseScheme('B'), ctx);
  check('blocks scheme: workbook total 76.32', withBlocks.score, 76.32);
  check('blocks scheme: same as formula scheme', withBlocks.score, withFormulas.score);
  check('blocks scheme: grade B+', withBlocks.letter, 'B+');
  // Gradebook columns keep their names after the conversion.
  const cols = withBlocks.trace.filter((t) => ['Report (out of 40)', 'Presentation (out of 45)'].includes(t.label)).map((t) => t.label);
  check('component names survive the conversion', cols, ['Report (out of 40)', 'Presentation (out of 45)']);

  // And the whole thing back into formulas.
  const outputEdge = edges.find((e) => e.target === 'total');
  check('total is fed by block results', !!outputEdge, true);
}

// ── sameResult really catches a wrong conversion ──────────────────────────────────────
{
  const nodes: GNode[] = [src('a'), { id: 'f', type: 'formula', position: { x: 0, y: 0 }, data: { expression: 'a * 2' } }];
  const edges: GEdge[] = [{ id: '1', source: 'a', target: 'f', input: 'a' }];
  const wrong: GNode[] = [src('a'), { id: 'b', type: 'op', position: { x: 0, y: 0 }, data: { op: 'multiplyBy', by: 3 } }];
  const wrongEdges: GEdge[] = [{ id: '1', source: 'a', target: 'b', input: 'in' }];
  check('a wrong conversion is detected', sameResult({ nodes, edges, rootId: 'f' }, { nodes: wrong, edges: wrongEdges, rootId: 'b' }, ['a']), false);
  check('evaluateSubgraph matches the formula', evaluateSubgraph(nodes, edges, 'f', { a: 21 }), evaluateExpression('a * 2', { a: 21 }));
}
check('catalog is keyed by op', Object.keys(BLOCK_BY_OP).length, BLOCKS.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
