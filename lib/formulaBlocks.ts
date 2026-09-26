// Formula <-> blocks, both ways, for the grading-scheme editor. Client-safe and pure: each
// converter returns a proposed change (nodes to add, nodes to remove, edges) plus plain-
// language steps, and `sameResult` proves on sample values that the change doesn't alter the
// arithmetic before the editor applies it.
//
//   formula -> blocks: "min(45, round(50 * (0.6 * sup + 0.4 * ev), 2))" becomes
//     Take 60% of sup, Take 40% of ev, Add together, Multiply by 50, Round to 2 places, Cap at 45.
//   blocks -> formula: a chain of math blocks collapses into one formula block whose inputs
//     are whatever feeds the chain from outside (marks, or blocks used elsewhere too).

import { compileExpression, expressionToAst, astToExpression, type ExprAst, ExpressionError } from '@/lib/gradingExpression';
import { BLOCK_BY_OP, blockParams, evaluateBlock } from '@/lib/gradingBlocks';

export interface GNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}
export interface GEdge {
  id: string;
  source: string;
  target: string;
  /** The input name / port on the target. */
  input: string;
}

export interface Conversion {
  ok: true;
  addNodes: GNode[];
  removeNodeIds: string[];
  /** Edges to add. Edges touching removed nodes are dropped by the caller. */
  addEdges: GEdge[];
  /** Plain-language steps, in order, for the preview. */
  steps: string[];
  /** The node that now produces the value (so the caller can select it). */
  resultNodeId: string;
}
export type ConversionResult = Conversion | { ok: false; reason: string; guidance: string };

let counter = 0;
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ── Evaluating a small part of a graph (for the "same result" check) ─────────────────

/** Value of `rootId`, with `fixed` supplying values for nodes treated as inputs. */
export function evaluateSubgraph(nodes: GNode[], edges: GEdge[], rootId: string, fixed: Record<string, number>): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const value = (id: string): number => {
    if (id in fixed) return fixed[id];
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) throw new Error('loop');
    visiting.add(id);
    const node = byId.get(id);
    const inputs = edges.filter((e) => e.target === id);
    const named: Record<string, number> = Object.create(null);
    const all: number[] = [];
    for (const e of inputs) {
      const v = value(e.source);
      named[e.input] = v;
      all.push(v);
    }
    let v = 0;
    if (!node) v = 0;
    else if (node.type === 'constant') v = Number(node.data.value) || 0;
    else if (node.type === 'scale') v = (all[0] ?? 0) * (Number(node.data.factor) || 0);
    else if (node.type === 'sum') {
      const w = (node.data.weights || {}) as Record<string, number>;
      v = inputs.reduce((t, e) => t + named[e.input] * (Number.isFinite(Number(w[e.input])) ? Number(w[e.input]) : 1), 0);
    } else if (node.type === 'formula') v = compileExpression(String(node.data.expression))(named);
    else if (node.type === 'op') v = evaluateBlock(String(node.data.op), node.data, named, all);
    else v = all[0] ?? 0;
    visiting.delete(id);
    memo.set(id, v);
    return v;
  };
  return value(rootId);
}

/**
 * Before and after give the same value for `samples` random sets of inputs. `inputs` are the
 * node ids feeding the converted part from outside; they get the same random value in both.
 */
export function sameResult(
  before: { nodes: GNode[]; edges: GEdge[]; rootId: string },
  after: { nodes: GNode[]; edges: GEdge[]; rootId: string },
  inputs: string[],
  samples = 40
): boolean {
  // Include awkward values: zero, whole numbers at rounding edges, fractions, negatives.
  const pool = [0, 1, 0.5, 0.125, 45, 50, 33.335, 0.66666, -3, 100];
  for (let i = 0; i < samples; i++) {
    const fixed: Record<string, number> = {};
    inputs.forEach((id, k) => {
      fixed[id] = i < pool.length ? pool[(i + k) % pool.length] : Math.round((Math.random() * 120 - 10) * 1000) / 1000;
    });
    const a = evaluateSubgraph(before.nodes, before.edges, before.rootId, fixed);
    const b = evaluateSubgraph(after.nodes, after.edges, after.rootId, fixed);
    if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a))) return false;
  }
  return true;
}

// ── formula -> blocks ─────────────────────────────────────────────────────────────────

const describe = (data: Record<string, unknown>) => {
  const def = BLOCK_BY_OP[String(data.op)];
  return def ? def.sentence(blockParams(def, data)) : String(data.op);
};

/**
 * Turns a formula block into math blocks. `inputs` maps each variable to the node feeding it
 * (the formula's incoming edges). Everything that reads the formula is rewired to the new
 * result block by the caller using `resultNodeId`.
 */
export function formulaToBlocks(formula: GNode, inputs: Record<string, string>): ConversionResult {
  let ast: ExprAst;
  try {
    ast = expressionToAst(String(formula.data.expression || ''));
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof ExpressionError ? err.message : 'The formula could not be read.',
      guidance: 'Fix the formula first - the block settings panel shows what is wrong.',
    };
  }

  const addNodes: GNode[] = [];
  const addEdges: GEdge[] = [];
  const steps: string[] = [];
  const unsupported: string[] = [];

  // A value in the tree: an existing node (a variable's source) or a node we create.
  const isNum = (a: ExprAst): a is { kind: 'num'; value: number } => a.kind === 'num';
  const hasVar = (a: ExprAst): boolean =>
    a.kind === 'var' || (a.kind === 'neg' && hasVar(a.arg)) || (a.kind === 'bin' && (hasVar(a.left) || hasVar(a.right))) || (a.kind === 'fn' && a.args.some(hasVar));
  // Pure-number parts become one number: 50 / 45 -> 1.1111.
  const fold = (a: ExprAst): ExprAst => {
    if (a.kind === 'num' || a.kind === 'var' || hasVar(a)) return a;
    return { kind: 'num', value: compileExpression(astToExpression(a))({}) };
  };

  const make = (data: Record<string, unknown>, from: Array<{ ref: string; input: string }>): string => {
    const id = uid('op');
    addNodes.push({ id, type: 'op', position: { x: 0, y: 0 }, data: { label: BLOCK_BY_OP[String(data.op)]?.title || String(data.op), ...data } });
    for (const f of from) addEdges.push({ id: uid('e'), source: f.ref, target: id, input: f.input });
    steps.push(describe(data));
    return id;
  };
  const constantNode = (value: number): string => {
    const id = uid('const');
    addNodes.push({ id, type: 'constant', position: { x: 0, y: 0 }, data: { label: String(value), value } });
    steps.push(`The number ${value}`);
    return id;
  };

  const flatten = (a: ExprAst, op: '+' | '*'): ExprAst[] =>
    a.kind === 'bin' && a.op === op ? [...flatten(a.left, op), ...flatten(a.right, op)] : [a];

  const build = (raw: ExprAst): string => {
    const a = fold(raw);
    if (a.kind === 'num') return constantNode(a.value);
    if (a.kind === 'var') {
      const src = inputs[a.name];
      if (!src) {
        unsupported.push(`"${a.name}" isn't connected to anything`);
        return constantNode(0);
      }
      return src;
    }
    if (a.kind === 'neg') return make({ op: 'multiplyBy', by: -1 }, [{ ref: build(a.arg), input: 'in' }]);

    if (a.kind === 'bin') {
      if (a.op === '+') {
        const parts = flatten(a, '+').map(fold);
        const nums = parts.filter(isNum).reduce((t, p) => t + p.value, 0);
        const rest = parts.filter((p) => !isNum(p));
        if (rest.length === 1) {
          const inner = build(rest[0]);
          return nums === 0 ? inner : make({ op: 'addNumber', n: nums }, [{ ref: inner, input: 'in' }]);
        }
        const ids = rest.map(build);
        const sum = make({ op: 'add' }, ids.map((ref, i) => ({ ref, input: i === 0 ? 'in' : `in_${i + 1}` })));
        return nums === 0 ? sum : make({ op: 'addNumber', n: nums }, [{ ref: sum, input: 'in' }]);
      }
      if (a.op === '-') {
        const left = fold(a.left);
        const right = fold(a.right);
        if (isNum(right)) return make({ op: 'addNumber', n: -right.value }, [{ ref: build(left), input: 'in' }]);
        return make({ op: 'subtract' }, [
          { ref: build(left), input: 'a' },
          { ref: build(right), input: 'b' },
        ]);
      }
      if (a.op === '*') {
        const parts = flatten(a, '*').map(fold);
        const k = parts.filter(isNum).reduce((t, p) => t * p.value, 1);
        const rest = parts.filter((p) => !isNum(p));
        let inner: string;
        if (rest.length === 1) inner = build(rest[0]);
        else {
          const ids = rest.map(build);
          inner = make({ op: 'multiply' }, ids.map((ref, i) => ({ ref, input: i === 0 ? 'in' : `in_${i + 1}` })));
        }
        if (k === 1) return inner;
        // A share like 0.6 reads best as "Take 60% of"; other factors as "Multiply by".
        return k > 0 && k < 1
          ? make({ op: 'percentOf', percent: Math.round(k * 100 * 1e8) / 1e8 }, [{ ref: inner, input: 'in' }])
          : make({ op: 'multiplyBy', by: k }, [{ ref: inner, input: 'in' }]);
      }
      if (a.op === '/') {
        const left = fold(a.left);
        const right = fold(a.right);
        if (isNum(right)) {
          // (mark * 40) / 33 reads as "change out of 33 to out of 40".
          if (left.kind === 'bin' && left.op === '*') {
            const f = flatten(left, '*').map(fold);
            const k = f.filter(isNum);
            const rest = f.filter((p) => !isNum(p));
            if (k.length === 1 && rest.length === 1) {
              return make({ op: 'rescale', from: right.value, to: k[0].value }, [{ ref: build(rest[0]), input: 'in' }]);
            }
          }
          return make({ op: 'divideBy', by: right.value }, [{ ref: build(left), input: 'in' }]);
        }
        return make({ op: 'divide' }, [
          { ref: build(left), input: 'a' },
          { ref: build(right), input: 'b' },
        ]);
      }
      unsupported.push(`the "${a.op}" operator`);
      return constantNode(0);
    }

    // Functions
    const args = a.args.map(fold);
    const nums = args.filter(isNum);
    const rest = args.filter((x) => !isNum(x));
    switch (a.name) {
      case 'round': {
        if (args.length === 1 || (args.length === 2 && isNum(args[1]))) {
          const places = args.length === 2 ? (args[1] as { value: number }).value : 0;
          if (Number.isInteger(places) && places >= 0) return make({ op: 'round', places }, [{ ref: build(args[0]), input: 'in' }]);
        }
        unsupported.push('round() with a computed number of places');
        return constantNode(0);
      }
      case 'floor':
        return make({ op: 'roundDown' }, [{ ref: build(args[0]), input: 'in' }]);
      case 'ceil':
        return make({ op: 'roundUp' }, [{ ref: build(args[0]), input: 'in' }]);
      case 'min':
      case 'max': {
        const cap = a.name === 'min' ? Math.min(...nums.map((n) => (n as { value: number }).value)) : Math.max(...nums.map((n) => (n as { value: number }).value));
        const many = (ids: string[]) =>
          make({ op: a.name === 'min' ? 'lowest' : 'highest' }, ids.map((ref, i) => ({ ref, input: i === 0 ? 'in' : `in_${i + 1}` })));
        const inner = rest.length === 1 ? build(rest[0]) : many(rest.map(build));
        if (nums.length === 0) return inner;
        return make(a.name === 'min' ? { op: 'atMost', max: cap } : { op: 'atLeast', min: cap }, [{ ref: inner, input: 'in' }]);
      }
      case 'clamp':
        if (args.length === 3 && isNum(args[1]) && isNum(args[2])) {
          return make({ op: 'between', min: (args[1] as { value: number }).value, max: (args[2] as { value: number }).value }, [
            { ref: build(args[0]), input: 'in' },
          ]);
        }
        unsupported.push('clamp() with computed limits');
        return constantNode(0);
      case 'if': {
        const cond = args[0];
        if (cond.kind === 'bin' && cond.op === '>=' && isNum(fold(cond.right))) {
          return make({ op: 'ifAtLeast', threshold: (fold(cond.right) as { value: number }).value }, [
            { ref: build(cond.left), input: 'value' },
            { ref: build(args[1]), input: 'then' },
            { ref: build(args[2]), input: 'else' },
          ]);
        }
        unsupported.push('if() with a condition other than "value >= number"');
        return constantNode(0);
      }
      default:
        unsupported.push(`${a.name}()`);
        return constantNode(0);
    }
  };

  const resultRef = build(ast);

  if (unsupported.length) {
    return {
      ok: false,
      reason: `There's no block yet for ${[...new Set(unsupported)].join(', ')}.`,
      guidance: 'Keep this formula as it is, or split it: move the supported parts into blocks and leave the rest in a smaller formula.',
    };
  }

  // The whole formula was a single input ("sup"): pass it through a no-op so the result
  // still has its own block.
  const resultNodeId = addNodes.some((n) => n.id === resultRef) ? resultRef : make({ op: 'add' }, [{ ref: resultRef, input: 'in' }]);

  // The result block keeps the formula's name: gradebooks and the course file use it as the
  // column header ("Presentation (out of 45)"), which must not become "Cap at a maximum".
  const result = addNodes.find((x) => x.id === resultNodeId)!;
  if (formula.data.label) result.data = { ...result.data, label: String(formula.data.label) };

  layoutRightToLeft(addNodes, addEdges, resultNodeId, formula.position);
  return { ok: true, addNodes, addEdges, removeNodeIds: [formula.id], steps, resultNodeId };
}

/** Places new blocks in columns leading left from where the formula stood. */
function layoutRightToLeft(nodes: GNode[], edges: GEdge[], rootId: string, at: { x: number; y: number }) {
  const depth = new Map<string, number>();
  const visit = (id: string, d: number) => {
    if (!nodes.some((n) => n.id === id)) return;
    if ((depth.get(id) ?? -1) >= d) return;
    depth.set(id, d);
    for (const e of edges) if (e.target === id) visit(e.source, d + 1);
  };
  visit(rootId, 0);
  const rows = new Map<number, number>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const row = rows.get(d) ?? 0;
    rows.set(d, row + 1);
    n.position = { x: at.x - d * 250, y: at.y + row * 120 };
  }
}

// ── blocks -> formula ─────────────────────────────────────────────────────────────────

/** Node types that can be written as part of a formula. */
const CONVERTIBLE = new Set(['op', 'constant', 'scale', 'sum', 'formula']);

const varName = (label: unknown, taken: Set<string>) => {
  const base =
    String(label || 'input')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, '_$1')
      .slice(0, 20) || 'input';
  let name = base;
  let i = 2;
  while (taken.has(name) || ['min', 'max', 'round', 'abs', 'floor', 'ceil', 'sqrt', 'clamp', 'if'].includes(name)) name = `${base}_${i++}`;
  taken.add(name);
  return name;
};

/**
 * Collapses the math blocks that feed `rootId` (the root included) into one formula block.
 * A block is folded in only if everything it feeds is folded in too; anything used elsewhere,
 * and anything that isn't math (marks, grade bands), stays and becomes a formula input.
 */
export function blocksToFormula(nodes: GNode[], edges: GEdge[], rootId: string): ConversionResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = byId.get(rootId);
  if (!root || !CONVERTIBLE.has(root.type)) {
    return { ok: false, reason: 'Only math blocks can become a formula.', guidance: 'Select a math block (Add, Round, Take a percentage, ...).' };
  }

  // Grow the set upstream from the root.
  const absorbed = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of edges) {
      if (!absorbed.has(e.target) || absorbed.has(e.source)) continue;
      const src = byId.get(e.source);
      if (!src || !CONVERTIBLE.has(src.type)) continue;
      const consumers = edges.filter((x) => x.source === src.id);
      if (consumers.every((x) => absorbed.has(x.target))) {
        absorbed.add(src.id);
        grew = true;
      }
    }
  }

  const taken = new Set<string>();
  const inputVar = new Map<string, string>(); // outside node id -> variable name
  const outsideVar = (id: string) => {
    if (!inputVar.has(id)) inputVar.set(id, varName(byId.get(id)?.data?.label, taken));
    return inputVar.get(id)!;
  };

  const astOf = (id: string): ExprAst => {
    if (!absorbed.has(id)) return { kind: 'var', name: outsideVar(id) };
    const n = byId.get(id)!;
    const ins = edges.filter((e) => e.target === id);
    const port = (p: string): ExprAst => {
      const e = ins.find((x) => x.input === p);
      return e ? astOf(e.source) : { kind: 'num', value: 0 };
    };
    const all = ins.map((e) => astOf(e.source));
    const chain = (op: string, list: ExprAst[], empty: number): ExprAst =>
      list.length === 0 ? { kind: 'num', value: empty } : list.reduce((l, r) => ({ kind: 'bin', op, left: l, right: r }));
    const num = (v: number): ExprAst => ({ kind: 'num', value: v });
    const bin = (op: string, left: ExprAst, right: ExprAst): ExprAst => ({ kind: 'bin', op, left, right });
    const fn = (name: string, ...args: ExprAst[]): ExprAst => ({ kind: 'fn', name, args });

    if (n.type === 'constant') return num(Number(n.data.value) || 0);
    if (n.type === 'scale') return bin('*', all[0] ?? num(0), num(Number(n.data.factor) || 0));
    if (n.type === 'sum') {
      const w = (n.data.weights || {}) as Record<string, number>;
      return chain(
        '+',
        ins.map((e) => {
          const weight = Number.isFinite(Number(w[e.input])) ? Number(w[e.input]) : 1;
          const v = astOf(e.source);
          return weight === 1 ? v : bin('*', num(weight), v);
        }),
        0
      );
    }
    if (n.type === 'formula') {
      const sub = (a: ExprAst): ExprAst => {
        if (a.kind === 'var') {
          const e = ins.find((x) => x.input === a.name);
          return e ? astOf(e.source) : num(0);
        }
        if (a.kind === 'neg') return { kind: 'neg', arg: sub(a.arg) };
        if (a.kind === 'bin') return { ...a, left: sub(a.left), right: sub(a.right) };
        if (a.kind === 'fn') return { ...a, args: a.args.map(sub) };
        return a;
      };
      return sub(expressionToAst(String(n.data.expression)));
    }
    // op
    const def = BLOCK_BY_OP[String(n.data.op)];
    const p = def ? blockParams(def, n.data) : {};
    switch (n.data.op) {
      case 'add':
        return chain('+', all, 0);
      case 'subtract':
        return bin('-', port('a'), port('b'));
      case 'multiply':
        return chain('*', all, 1);
      case 'divide':
        return bin('/', port('a'), port('b'));
      case 'percentOf':
        return bin('*', num(p.percent / 100), port('in'));
      case 'multiplyBy':
        return bin('*', port('in'), num(p.by));
      case 'divideBy':
        return bin('/', port('in'), num(p.by));
      case 'addNumber':
        return bin('+', port('in'), num(p.n));
      case 'round':
        return fn('round', port('in'), num(p.places));
      case 'roundUp':
        return fn('ceil', port('in'));
      case 'roundDown':
        return fn('floor', port('in'));
      case 'atMost':
        return fn('min', port('in'), num(p.max));
      case 'atLeast':
        return fn('max', port('in'), num(p.min));
      case 'between':
        return fn('clamp', port('in'), num(p.min), num(p.max));
      case 'average':
        return all.length ? bin('/', chain('+', all, 0), num(all.length)) : num(0);
      case 'highest':
        return all.length ? fn('max', ...all) : num(0);
      case 'lowest':
        return all.length ? fn('min', ...all) : num(0);
      case 'rescale':
        return bin('/', bin('*', port('in'), num(p.to)), num(p.from));
      case 'ifAtLeast':
        return fn('if', bin('>=', port('value'), num(p.threshold)), port('then'), port('else'));
      default:
        throw new Error(`unknown block ${String(n.data.op)}`);
    }
  };

  let expression: string;
  try {
    expression = astToExpression(astOf(rootId));
    compileExpression(expression);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'These blocks could not be written as a formula.',
      guidance: 'Formulas are limited to 500 characters - try converting a smaller part.',
    };
  }

  const formulaId = uid('formula');
  const addNodes: GNode[] = [
    { id: formulaId, type: 'formula', position: root.position, data: { label: String(root.data.label || 'Formula'), expression } },
  ];
  const addEdges: GEdge[] = [...inputVar].map(([source, name]) => ({ id: uid('e'), source, target: formulaId, input: name }));
  // Whatever read the root now reads the formula, on the same input name/port.
  for (const e of edges) if (e.source === rootId && !absorbed.has(e.target)) addEdges.push({ ...e, id: uid('e'), source: formulaId });

  const steps = [
    `${absorbed.size} block${absorbed.size === 1 ? '' : 's'} become one formula:`,
    expression,
    ...[...inputVar].map(([id, name]) => `"${name}" is ${String(byId.get(id)?.data?.label || id)}`),
  ];
  return { ok: true, addNodes, addEdges, removeNodeIds: [...absorbed], steps, resultNodeId: formulaId };
}

/** Applies a conversion to a graph (used by tests and the editor alike). */
export function applyConversion(nodes: GNode[], edges: GEdge[], c: Conversion, rewireFrom?: string): { nodes: GNode[]; edges: GEdge[] } {
  const removed = new Set(c.removeNodeIds);
  // formula -> blocks: what read the formula now reads the result block.
  const rewired = rewireFrom
    ? edges.filter((e) => e.source === rewireFrom && !removed.has(e.target)).map((e) => ({ ...e, id: uid('e'), source: c.resultNodeId }))
    : [];
  return {
    nodes: [...nodes.filter((n) => !removed.has(n.id)), ...c.addNodes],
    edges: [...edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)), ...c.addEdges, ...rewired],
  };
}
