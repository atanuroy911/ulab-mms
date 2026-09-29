// A grading scheme in plain words, read straight off its blocks - so it is always exactly
// what the scheme computes and changes as the scheme is edited. Client-safe and pure.
//
// Each part of the final score (Report, Presentation, ...) becomes numbered steps a person
// could follow by hand:
//   1. Take the supervisor's report mark scaled to 40 marks, then round to 2 decimal places.
//   2. Take the chosen evaluators' average report mark scaled to 40 marks, then round to ...
//   3. Add 60% of step 1 and 40% of step 2, then round to 2 decimal places.
import { expressionToAst, type ExprAst } from '@/lib/gradingExpression';
import { BLOCK_BY_OP, blockParams } from '@/lib/gradingBlocks';
import { evaluateScheme, type MarkInput, type SchemeGraph } from '@/lib/gradingEngine';

interface SNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}
interface SEdge {
  source: string;
  target: string;
  /** The input it feeds (a formula variable, a block port, a sum's weight key). */
  targetHandle?: string | null;
}

export interface SummaryStep {
  /** The block this step belongs to, so the editor can point at it. */
  nodeId: string;
  label: string;
  text: string;
}

export interface SummaryPart {
  nodeId: string;
  /** The block's own label, e.g. "Report (out of 40)". */
  title: string;
  /** The most it can add to the final score, when that can be worked out. */
  max: number | null;
  /** The marks it reads, e.g. "the supervisor's report mark (out of 33)". */
  uses: string[];
  steps: SummaryStep[];
}

export interface SchemeSummary {
  /** One sentence: what the final score adds up and how it becomes a letter. */
  headline: string;
  parts: SummaryPart[];
  /** The letter grade bands, highest first. */
  bands: Array<{ letter: string; min: number }>;
  /** Things worth knowing: disconnected blocks, per-group evaluator choice, ... */
  notes: string[];
  /** The perfect score - what full marks everywhere gives. */
  totalMax: number | null;
}

const COMPONENT: Record<string, string> = { report: 'report', presentation: 'presentation', peer: 'peer', weeklyJournal: 'weekly journal', poster: 'poster' };
const SCOPE_WHO: Record<string, string> = { supervisor: "the supervisor's", chosenEvaluator: "the chosen evaluators'", allEvaluator: "all evaluators'" };
const AGGREGATE: Record<string, string> = { mean: 'average', max: 'best', min: 'lowest', sum: 'total', count: 'number of' };
/** Full marks where a scheme doesn't say (report/presentation come from their rubric). */
const DEFAULT_MAX: Record<string, number> = { presentation: 45, peer: 5, weeklyJournal: 10, poster: 12 };

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);
const pct = (f: number) => `${fmt(f * 100)}%`;
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const places = (n: number) => (n === 0 ? 'the nearest whole number' : `${fmt(n)} decimal place${n === 1 ? '' : 's'}`);
const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Brackets for a compound phrase used inside another ("60% of (a ÷ 45)"). */
const wrap = (s: string) => (/ [÷×+−] | plus | minus /.test(s) ? `(${s})` : s);

/** A mark, as it reads in a sentence. */
function sourceText(n: SNode) {
  const d = n.data || {};
  const comp = COMPONENT[String(d.component)] || String(d.component);
  const scope = String(d.scope);
  if (scope === 'supervisor') return `the supervisor's ${comp} mark`;
  const agg = AGGREGATE[String(d.aggregate)] || 'combined';
  return `${SCOPE_WHO[scope] || ''} ${agg} ${comp} mark`.trim();
}
function sourceMax(n: SNode): number | null {
  const d = n.data || {};
  return Number(d.rubricMaxOverride) || DEFAULT_MAX[String(d.component)] || null;
}

/** What an input is, to the block that uses it. */
interface Ref {
  /** How it reads in a sentence: "step 2", "0.6", "the supervisor's report mark ÷ 33". */
  text: string;
  /** Set when the input is a mark read as a fraction of its full mark. */
  fraction?: { mark: string; max: number | null };
}

export function summarizeScheme(graph: { nodes: SNode[]; edges: SEdge[] }): SchemeSummary {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const inputsOf = (id: string) => graph.edges.filter((e) => e.target === id);
  const labelOf = (n: SNode) => String(n.data?.label || '').trim() || n.type;

  // ── The shape: final grade <- (bands) <- total <- parts ─────────────────────────────────
  const output = graph.nodes.find((n) => n.type === 'output');
  const bandsNode = graph.nodes.find((n) => n.type === 'gradeBands');
  const bands = [...((bandsNode?.data?.bands as Array<{ min: number; letter: string }>) || [])].sort((a, b) => b.min - a.min).map((b) => ({ letter: b.letter, min: Number(b.min) }));
  let top: string | null = output ? inputsOf(output.id)[0]?.source ?? null : null;
  while (top && byId.get(top)?.type === 'gradeBands') top = inputsOf(top)[0]?.source ?? null;
  const topNode = top ? byId.get(top) : undefined;
  const combines = !!topNode && ((topNode.type === 'sum' && inputsOf(topNode.id).length > 1) || (topNode.type === 'op' && ['add', 'average'].includes(String(topNode.data?.op))));
  const partIds = topNode ? (combines ? inputsOf(topNode.id).map((e) => e.source) : [topNode.id]) : [];
  const perfect = perfectValues(graph);

  const parts: SummaryPart[] = partIds.map((partId) => {
    const steps: SummaryStep[] = [];
    const refs = new Map<string, Ref>();
    const uses = new Map<string, string>();

    const refOf = (e: SEdge | undefined): Ref => {
      if (!e) return { text: 'nothing (not connected)' };
      return refs.get(e.source) ?? { text: `“${labelOf(byId.get(e.source) ?? { id: '', type: '?' })}”` };
    };

    // Work through the part's blocks, inputs first; each leaves a Ref for its users.
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id) || !byId.has(id)) return;
      seen.add(id);
      for (const e of inputsOf(id)) visit(e.source);
      order.push(id);
    };
    visit(partId);

    for (const id of order) {
      const n = byId.get(id)!;
      const d = n.data || {};
      const ins = inputsOf(id);
      const push = (text: string) => {
        steps.push({ nodeId: id, label: labelOf(n), text: capitalise(text.replace(/\.$/, '')) + '.' });
        return `step ${steps.length}`;
      };
      /**
       * Continues the latest step (", then round to 2 decimal places") when `ref` is that step
       * and nothing else uses it - its own block's, or the one block feeding this one.
       */
      const then = (ref: string, suffix: string, fallback: string, from?: string) => {
        const last = steps[steps.length - 1];
        const onlyUser = from !== undefined && graph.edges.filter((e) => e.source === from).length === 1;
        if (ref === `step ${steps.length}` && last && (last.nodeId === id || onlyUser)) {
          last.text = `${last.text.replace(/\.$/, '')}, then ${suffix}.`;
          last.nodeId = id;
          last.label = labelOf(n);
          return ref;
        }
        return push(fallback);
      };

      if (n.type === 'source') {
        const max = sourceMax(n);
        uses.set(id, `${sourceText(n)}${max ? ` (out of ${fmt(max)})` : ''}`);
        const normalized = d.normalize !== false;
        refs.set(id, normalized ? { text: `${sourceText(n)} ÷ ${max ? fmt(max) : 'its full mark'}`, fraction: { mark: sourceText(n), max } } : { text: sourceText(n) });
        // A part that is just a mark.
        if (id === partId) push(normalized ? `Take ${sourceText(n)} as a fraction of ${max ? fmt(max) : 'its full mark'}` : `Take ${sourceText(n)} as it is`);
        continue;
      }
      if (n.type === 'constant') {
        refs.set(id, { text: fmt(Number(d.value) || 0) });
        if (id === partId) push(`Always ${fmt(Number(d.value) || 0)}`);
        continue;
      }

      let result: string;
      switch (n.type) {
        case 'scale': {
          const r = refOf(ins[0]);
          const f = Number(d.factor) || 0;
          result = push(r.fraction && f >= 1 ? `Take ${r.fraction.mark} scaled to ${fmt(f)} marks` : f > 0 && f < 1 ? `Take ${pct(f)} of ${wrap(r.text)}` : `Multiply ${wrap(r.text)} by ${fmt(f)}`);
          break;
        }
        case 'sum': {
          const weights = (d.weights || {}) as Record<string, number>;
          const terms = ins.map((e) => {
            const key = e.targetHandle || 'in';
            const w = Object.prototype.hasOwnProperty.call(weights, key) ? Number(weights[key]) : 1;
            const r = refOf(e);
            return w === 1 ? r.text : w > 0 && w < 1 ? `${pct(w)} of ${wrap(r.text)}` : `${fmt(w)} × ${wrap(r.text)}`;
          });
          result = push(terms.length === 0 ? 'Nothing is connected, so 0' : terms.length === 1 ? `Take ${terms[0]}` : `Add ${listJoin(terms)}`);
          break;
        }
        case 'formula': {
          let ast: ExprAst | null = null;
          try {
            ast = expressionToAst(String(d.expression || ''));
          } catch {
            result = push(`Work out the formula ${String(d.expression || '')} (it has an error)`);
            break;
          }
          const vars = new Map(ins.map((e) => [e.targetHandle || 'in', refOf(e)]));
          result = formulaSteps(ast, (name) => vars.get(name) ?? { text: `${name} (not connected)` }, push, then);
          break;
        }
        case 'op':
          result = opSteps(String(d.op || ''), d, ins, refOf, push, then);
          break;
        default:
          result = push(`Take ${refOf(ins[0]).text}`);
      }
      refs.set(id, { text: result });
    }

    const n = byId.get(partId)!;
    return { nodeId: partId, title: labelOf(n), max: perfect?.get(partId) ?? null, uses: [...uses.values()], steps };
  });

  const totalMax = perfect && top ? perfect.get(top) ?? null : null;
  const partNames = parts.map((p) => `${p.title}${p.max !== null && !p.title.includes(fmt(p.max)) ? ` (up to ${fmt(p.max)})` : ''}`);
  let headline: string;
  if (!output) headline = 'This scheme has no Final Grade block yet, so it does not produce a grade.';
  else if (!topNode) headline = 'Nothing is connected to the Final Grade yet.';
  else {
    const how = topNode.type === 'op' && topNode.data?.op === 'average' ? `the average of ${listJoin(partNames)}` : combines ? `${listJoin(partNames)}, added together` : partNames[0];
    headline = `The final score is ${how}${totalMax !== null ? ` - out of ${fmt(totalMax)} in all` : ''}${bands.length ? ', then turned into a letter grade.' : '.'}`;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────────────────
  const notes: string[] = [];
  const reaches = new Set<string>();
  const markUp = (id: string) => {
    if (reaches.has(id)) return;
    reaches.add(id);
    for (const e of inputsOf(id)) markUp(e.source);
  };
  if (output) markUp(output.id);
  const loose = graph.nodes.filter((n) => !reaches.has(n.id) && n.type !== 'output');
  if (loose.length) notes.push(`${loose.length === 1 ? 'This block is' : 'These blocks are'} not connected to the final grade, so ${loose.length === 1 ? 'it has' : 'they have'} no effect: ${listJoin(loose.map((n) => `“${labelOf(n)}”`))}.`);
  const used = (pred: (n: SNode) => boolean) => graph.nodes.some((n) => reaches.has(n.id) && pred(n));
  if (used((n) => n.type === 'source' && n.data?.scope === 'chosenEvaluator')) {
    notes.push('“Chosen evaluators” are decided for each group in its Manage tab: all of them, each student’s top K, or evaluators the coordinator picks - averaged or the best.');
  }
  if (used((n) => n.type === 'source' && n.data?.scope === 'supervisor')) {
    notes.push('If a group’s supervisor changes, the new supervisor’s mark counts; the previous one’s is used only where the new supervisor hasn’t marked yet.');
  }
  if (used((n) => (n.type === 'formula' && /round\(/.test(String(n.data?.expression))) || (n.type === 'op' && n.data?.op === 'round'))) {
    notes.push('Rounding works as in Excel: halves round up (18.775 becomes 18.78).');
  }
  return { headline, parts, bands, notes, totalMax };
}

type Push = (text: string) => string;
type Then = (ref: string, suffix: string, fallback: string, from?: string) => string;

/**
 * A formula as steps. Returns what the formula's result reads as ("step 3"). Brackets and
 * nested calls become earlier steps, so every step is short.
 */
function formulaSteps(ast: ExprAst, v: (name: string) => Ref, push: Push, then: Then): string {
  const isStep = (s: string) => /^step \d+$/.test(s);

  const go = (a: ExprAst): string => {
    switch (a.kind) {
      case 'num':
        return fmt(a.value);
      case 'var':
        return v(a.name).text;
      case 'neg':
        return `−${wrap(go(a.arg))}`;
      case 'fn': {
        const [x, y, z] = a.args;
        if (a.name === 'round') {
          const p = y?.kind === 'num' ? y.value : y ? null : 0;
          const inner = go(x);
          const how = p === null ? `round to ${go(y!)} decimal places` : `round to ${places(p)}`;
          return isStep(inner) ? then(inner, how, `${capitalise(how)} ${inner}`) : push(`Take ${inner}, then ${how}`);
        }
        if ((a.name === 'min' || a.name === 'max') && a.args.length === 2 && a.args.some((q) => q.kind === 'num')) {
          const num = a.args.find((q) => q.kind === 'num') as { value: number };
          const other = go(a.args.find((q) => q !== (num as unknown))!);
          const how = a.name === 'min' ? `cap it at ${fmt(num.value)} (no more than ${fmt(num.value)})` : `make it at least ${fmt(num.value)}`;
          return isStep(other) ? then(other, how, `Take ${other}, then ${how}`) : push(`Take ${other}, then ${how}`);
        }
        if (a.name === 'min' || a.name === 'max') return push(`Take the ${a.name === 'min' ? 'lowest' : 'highest'} of ${listJoin(a.args.map((q) => wrap(go(q))))}`);
        if (a.name === 'clamp') return push(`Keep ${wrap(go(x))} between ${go(y)} and ${go(z)}`);
        if (a.name === 'floor') return push(`Round ${wrap(go(x))} down to a whole number`);
        if (a.name === 'ceil') return push(`Round ${wrap(go(x))} up to a whole number`);
        if (a.name === 'abs') return push(`Take ${wrap(go(x))} without its sign`);
        if (a.name === 'sqrt') return push(`Take the square root of ${wrap(go(x))}`);
        if (a.name === 'if') return push(`If ${go(x)}, use ${wrap(go(y))}; otherwise use ${wrap(go(z))}`);
        return push(`Work out ${a.name}(${a.args.map((q) => go(q)).join(', ')})`);
      }
      case 'bin': {
        const { op, left, right } = a;
        if (op === '+' || op === '-') {
          // Flatten a + b - c + d into terms.
          const terms: Array<{ sign: 1 | -1; node: ExprAst }> = [];
          const collect = (q: ExprAst, sign: 1 | -1) => {
            if (q.kind === 'bin' && (q.op === '+' || q.op === '-')) {
              collect(q.left, sign);
              collect(q.right, q.op === '-' ? ((-sign) as 1 | -1) : sign);
            } else terms.push({ sign, node: q });
          };
          collect(a, 1);
          const pos = terms.filter((t) => t.sign === 1).map((t) => go(t.node));
          const neg = terms.filter((t) => t.sign === -1).map((t) => go(t.node));
          const text = neg.length === 0 ? `Add ${listJoin(pos)}` : pos.length === 1 && neg.length === 1 ? `Take ${wrap(pos[0])} minus ${wrap(neg[0])}` : `Add ${listJoin(pos)}, then subtract ${listJoin(neg)}`;
          return push(text);
        }
        if (op === '*') {
          const num = left.kind === 'num' ? left : right.kind === 'num' ? right : null;
          const other = num === left ? right : left;
          if (num) {
            const r = other.kind === 'var' ? v(other.name) : null;
            if (r?.fraction && num.value >= 1) return `${r.fraction.mark} scaled to ${fmt(num.value)} marks`;
            if (num.value > 0 && num.value < 1) return `${pct(num.value)} of ${wrap(go(other))}`;
            return `${wrap(go(other))} × ${fmt(num.value)}`;
          }
          return `${wrap(go(left))} × ${wrap(go(right))}`;
        }
        if (op === '/') {
          // x * a / b: a change of scale.
          if (left.kind === 'bin' && left.op === '*' && right.kind === 'num') {
            const a2 = left.left.kind === 'num' ? left.left : left.right.kind === 'num' ? left.right : null;
            if (a2) {
              const x = a2 === left.left ? left.right : left.left;
              return `${wrap(go(x))} turned from out of ${fmt(right.value)} into out of ${fmt((a2 as { value: number }).value)}`;
            }
          }
          return `${wrap(go(left))} ÷ ${wrap(go(right))}`;
        }
        const words: Record<string, string> = { '%': 'remainder after dividing by', '^': 'to the power of', '>=': 'is at least', '<=': 'is at most', '>': 'is more than', '<': 'is less than', '==': 'equals', '!=': 'is not' };
        return `${wrap(go(left))} ${words[op] || op} ${wrap(go(right))}`;
      }
    }
  };
  const result = go(ast);
  return isStep(result) ? result : push(`Take ${result}`);
}

/** A maths block as a step. */
function opSteps(op: string, d: Record<string, unknown>, ins: SEdge[], refOf: (e: SEdge | undefined) => Ref, push: Push, then: Then): string {
  const def = BLOCK_BY_OP[op];
  if (!def) return push(`Use the “${op}” block`);
  const q = blockParams(def, d);
  const at = (port: string) => refOf(ins.find((e) => (e.targetHandle || 'in') === port)).text;
  const all = ins.map((e) => wrap(refOf(e).text));
  const inEdge = ins.find((e) => (e.targetHandle || 'in') === 'in');
  const one = at('in');
  const oneRef = refOf(inEdge);
  const from = inEdge?.source;
  switch (op) {
    case 'add':
      return push(all.length ? `Add ${listJoin(all)}` : 'Nothing is connected, so 0');
    case 'subtract':
      return push(`Take ${wrap(at('a'))} minus ${wrap(at('b'))}`);
    case 'multiply':
      return push(`Multiply ${listJoin(all)}`);
    case 'divide':
      return push(`Divide ${wrap(at('a'))} by ${wrap(at('b'))}`);
    case 'percentOf':
      return then(one, `take ${fmt(q.percent)}% of it`, `Take ${fmt(q.percent)}% of ${wrap(one)}`, from);
    case 'multiplyBy':
      return oneRef.fraction && q.by >= 1 ? push(`Take ${oneRef.fraction.mark} scaled to ${fmt(q.by)} marks`) : then(one, `multiply by ${fmt(q.by)}`, `Multiply ${wrap(one)} by ${fmt(q.by)}`, from);
    case 'divideBy':
      return then(one, `divide by ${fmt(q.by)}`, `Divide ${wrap(one)} by ${fmt(q.by)}`, from);
    case 'addNumber':
      return q.n >= 0 ? then(one, `add ${fmt(q.n)}`, `Add ${fmt(q.n)} to ${wrap(one)}`, from) : then(one, `subtract ${fmt(-q.n)}`, `Subtract ${fmt(-q.n)} from ${wrap(one)}`, from);
    case 'round':
      return then(one, `round to ${places(q.places)}`, `Round ${wrap(one)} to ${places(q.places)}`, from);
    case 'roundUp':
      return then(one, 'round up to a whole number', `Round ${wrap(one)} up to a whole number`, from);
    case 'roundDown':
      return then(one, 'round down to a whole number', `Round ${wrap(one)} down to a whole number`, from);
    case 'atMost':
      return then(one, `cap it at ${fmt(q.max)}`, `Cap ${wrap(one)} at ${fmt(q.max)} (no more than ${fmt(q.max)})`, from);
    case 'atLeast':
      return then(one, `make it at least ${fmt(q.min)}`, `Make ${wrap(one)} at least ${fmt(q.min)}`, from);
    case 'between':
      return then(one, `keep it between ${fmt(q.min)} and ${fmt(q.max)}`, `Keep ${wrap(one)} between ${fmt(q.min)} and ${fmt(q.max)}`, from);
    case 'average':
      return push(`Average ${listJoin(all)}`);
    case 'highest':
      return push(`Take the highest of ${listJoin(all)}`);
    case 'lowest':
      return push(`Take the lowest of ${listJoin(all)}`);
    case 'rescale':
      return then(one, `turn it from out of ${fmt(q.from)} into out of ${fmt(q.to)}`, `Turn ${wrap(one)} from out of ${fmt(q.from)} into out of ${fmt(q.to)}`, from);
    case 'ifAtLeast':
      return push(`If ${wrap(at('value'))} is at least ${fmt(q.threshold)}, use ${wrap(at('then'))}; otherwise use ${wrap(at('else'))}`);
    default:
      return push(`${def.title}: ${listJoin(all)}`);
  }
}

/** Every block's value when every mark is full - the most each part can give. */
function perfectValues(graph: { nodes: SNode[]; edges: SEdge[] }): Map<string, number> | null {
  try {
    const marks: MarkInput[] = [];
    for (const n of graph.nodes) {
      if (n.type !== 'source') continue;
      const comp = String(n.data?.component);
      const max = sourceMax(n) || 1;
      const role = n.data?.scope === 'supervisor' ? 'supervisor' : 'evaluator';
      const who = role === 'supervisor' ? 'SUP' : 'EV';
      if (!marks.some((m) => m.component === comp && m.submitterId === who)) {
        marks.push({ component: comp as MarkInput['component'], submitterId: who, submitterRole: role, rawScore: max, rubricMax: max });
      }
    }
    const scheme = {
      nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, position: { x: 0, y: 0 }, data: n.data || {} })),
      edges: graph.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target, targetHandle: e.targetHandle || 'in' })),
    } as unknown as SchemeGraph;
    const all = ['EV'];
    const result = evaluateScheme(scheme, { studentAccountId: 'perfect', marks, supervisorId: 'SUP', chosenEvaluators: { report: all, presentation: all, poster: all } });
    return new Map(result.trace.map((t) => [t.nodeId, Math.round(t.value * 100) / 100]));
  } catch {
    return null;
  }
}
