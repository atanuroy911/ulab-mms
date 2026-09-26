/**
 * "Tidy up": marks on the left, final grade on the right, every wire pointing right, nothing
 * overlapping, feeders next to what they feed - on the real department scheme too.
 */
import { tidyLayout, type LayoutNode } from '../lib/schemeLayout';
import { defaultCseScheme } from '../lib/gradingEngine';
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

function assess(label: string, nodes: LayoutNode[], edges: Array<{ source: string; target: string }>) {
  const pos = tidyLayout(nodes, edges);
  check(`${label}: every block placed`, Object.keys(pos).length, nodes.length);
  check(`${label}: every wire points right`, edges.every((e) => pos[e.source].x < pos[e.target].x), true);
  const boxes = nodes.map((n) => ({ id: n.id, x: pos[n.id].x, y: pos[n.id].y, w: n.width || 220, h: n.height || 110 }));
  const overlap = boxes.some((a, i) => boxes.slice(i + 1).some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  check(`${label}: nothing overlaps`, overlap, false);
  return pos;
}

// The department scheme, as saved (formulas).
const g = defaultCseScheme('A');
const scrambled = g.nodes.map((n, i) => ({ id: n.id, position: { x: (i * 137) % 500, y: (i * 251) % 700 } }));
const pos = assess('CSE scheme', scrambled, g.edges);
check('final grade is furthest right', Object.entries(pos).sort((a, b) => b[1].x - a[1].x)[0][0], 'final');
check('marks start at the left edge', ['report_sup', 'report_eval', 'pres_sup', 'pres_eval'].every((id) => pos[id].x === 0), true);
// Peer and journal feed the total directly, so they sit in the column just before it.
check('peer mark sits next to the total', pos.peer.x < pos.total.x && pos.peer.x > pos.report_sup.x, true);
check('report blocks are neighbours', Math.abs(pos.report_sup.y - pos.report_eval.y) < Math.abs(pos.report_sup.y - pos.pres_eval.y), true);
check('layout is repeatable', JSON.stringify(tidyLayout(scrambled, g.edges)), JSON.stringify(pos));

// The same scheme converted to blocks - many more blocks, still clean.
let nodes: GNode[] = g.nodes.map((n) => ({ ...n, data: { ...n.data } }));
let edges: GEdge[] = g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, input: e.targetHandle || 'in' }));
for (const f of nodes.filter((n) => n.type === 'formula')) {
  const c = formulaToBlocks(f, Object.fromEntries(edges.filter((e) => e.target === f.id).map((e) => [e.input, e.source])));
  if (!c.ok) throw new Error(c.reason);
  ({ nodes, edges } = applyConversion(nodes, edges, c, f.id));
}
assess('scheme in blocks', nodes.map((n, i) => ({ id: n.id, position: { x: 0, y: i * 10 } })), edges);

// A number feeding a late step sits right next to it, not stranded at the far left.
const late = tidyLayout(
  [
    { id: 'm', position: { x: 0, y: 0 } },
    { id: 'a', position: { x: 0, y: 0 } },
    { id: 'b', position: { x: 0, y: 0 } },
    { id: 'n', position: { x: 0, y: 0 } },
    { id: 'c', position: { x: 0, y: 0 } },
  ],
  [
    { source: 'm', target: 'a' },
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'n', target: 'c' },
  ]
);
check('number sits one column before its consumer', late.n.x === late.b.x, true);

// Real sizes are respected: tall blocks push the next one down.
const sized = tidyLayout(
  [
    { id: 'x', height: 300, position: { x: 0, y: 0 } },
    { id: 'y', height: 50, position: { x: 0, y: 1 } },
  ],
  []
);
check('tall block does not overlap the next', sized.y.y >= sized.x.y + 300, true);

// Loops and stray blocks don't break it.
assess('with a loop', [{ id: 'p', position: { x: 0, y: 0 } }, { id: 'q', position: { x: 0, y: 0 } }, { id: 'lone', position: { x: 0, y: 0 } }], []);
const loop = tidyLayout([{ id: 'p', position: { x: 0, y: 0 } }, { id: 'q', position: { x: 0, y: 0 } }], [{ source: 'p', target: 'q' }, { source: 'q', target: 'p' }]);
check('a loop still gets positions', Object.keys(loop).length, 2);
check('empty canvas', tidyLayout([], []), {});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
