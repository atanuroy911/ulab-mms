// "Tidy up" for the grading-scheme canvas: a clean left-to-right layout. Pure, so it can be
// tested and undone.
//
//   1. Columns: each block sits one column right of the furthest block feeding it, so marks
//      start on the left and the final grade ends on the right.
//   2. Blocks that only feed something (a Number, a mark used by one late step) move right up
//      next to what they feed, instead of stranding far left with a long wire.
//   3. Order within a column follows the blocks it connects to (barycentre sweeps), which is
//      what untangles crossing wires.
//   4. Columns are stacked with each block's real size, so nothing overlaps, and centred.

export interface LayoutNode {
  id: string;
  width?: number;
  height?: number;
  /** Current position - the starting order within a column. */
  position: { x: number; y: number };
}
export interface LayoutEdge {
  source: string;
  target: string;
}

const COLUMN_GAP = 90;
const ROW_GAP = 36;
const DEFAULT_W = 220;
const DEFAULT_H = 110;

export function tidyLayout(nodes: LayoutNode[], edges: LayoutEdge[]): Record<string, { x: number; y: number }> {
  const ids = new Set(nodes.map((n) => n.id));
  const valid = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const preds = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const succs = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of valid) {
    preds.get(e.target)!.push(e.source);
    succs.get(e.source)!.push(e.target);
  }

  // Topological order (Kahn). Anything left over sits in a loop - kept at the end, ranked 0.
  const indeg = new Map(nodes.map((n) => [n.id, preds.get(n.id)!.length]));
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const t of succs.get(id)!) {
      indeg.set(t, indeg.get(t)! - 1);
      if (indeg.get(t) === 0) queue.push(t);
    }
  }
  const inLoop = nodes.map((n) => n.id).filter((id) => !topo.includes(id));

  // 1. Longest path from the left.
  const rank = new Map<string, number>();
  for (const id of topo) rank.set(id, Math.max(0, ...preds.get(id)!.map((p) => (rank.get(p) ?? 0) + 1)));
  for (const id of inLoop) rank.set(id, 0);

  // 2. Pull feeders right, next to their nearest consumer (sinks stay where they are).
  for (const id of [...topo].reverse()) {
    const out = succs.get(id)!;
    if (out.length) rank.set(id, Math.min(...out.map((t) => rank.get(t)!)) - 1);
  }
  const minRank = Math.min(...[...rank.values()]);
  for (const [id, r] of rank) rank.set(id, r - minRank);

  // 3. Order within each column.
  const columns = new Map<number, string[]>();
  for (const n of [...nodes].sort((a, b) => a.position.y - b.position.y)) {
    const r = rank.get(n.id)!;
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r)!.push(n.id);
  }
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  const order = new Map<string, number>();
  const renumber = () => {
    for (const r of ranks) columns.get(r)!.forEach((id, i) => order.set(id, i));
  };
  renumber();
  const sweep = (list: string[], neighbours: (id: string) => string[]) => {
    const bary = (id: string) => {
      const ns = neighbours(id).filter((x) => order.has(x));
      return ns.length ? ns.reduce((t, x) => t + order.get(x)!, 0) / ns.length : order.get(id)!;
    };
    const scored = list.map((id) => ({ id, b: bary(id), o: order.get(id)! }));
    scored.sort((a, b) => a.b - b.b || a.o - b.o);
    return scored.map((s) => s.id);
  };
  for (let pass = 0; pass < 6; pass++) {
    const forward = pass % 2 === 0;
    for (const r of forward ? ranks : [...ranks].reverse()) {
      columns.set(r, sweep(columns.get(r)!, (id) => (forward ? preds.get(id)! : succs.get(id)!)));
      renumber();
    }
  }

  // 4. Coordinates: column x from the widest block in each column; rows stacked and centred.
  const size = new Map(nodes.map((n) => [n.id, { w: n.width || DEFAULT_W, h: n.height || DEFAULT_H }]));
  const out: Record<string, { x: number; y: number }> = {};
  let x = 0;
  for (const r of ranks) {
    const col = columns.get(r)!;
    const width = Math.max(...col.map((id) => size.get(id)!.w));
    const total = col.reduce((t, id) => t + size.get(id)!.h, 0) + ROW_GAP * (col.length - 1);
    let y = -total / 2;
    for (const id of col) {
      out[id] = { x, y: Math.round(y) };
      y += size.get(id)!.h + ROW_GAP;
    }
    x += width + COLUMN_GAP;
  }
  return out;
}
