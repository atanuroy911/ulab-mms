import { compileExpression, expressionVariables, ExpressionError } from './gradingExpression';
import { blockIssues, evaluateBlock } from './gradingBlocks';
import type {
  IGradingNode,
  IGradingEdge,
  GradingAggregate,
  GradingSubmitterScope,
} from '@/models/GradingScheme';
import type { CapstoneMarkComponent } from '@/models/CapstoneMarkSubmission';

/**
 * Validation and evaluation for grading schemes.
 *
 * The graph is evaluated once per student. Every node yields a single number; edges carry
 * that number into a named input slot on the next node. `validateScheme` is run on every
 * save so a broken scheme is rejected at authoring time rather than discovered halfway
 * through grading a cohort.
 */

export const GRADING_COMPONENTS: CapstoneMarkComponent[] = [
  'report',
  'presentation',
  'peer',
  'weeklyJournal',
  'poster',
];

export interface SchemeGraph {
  nodes: IGradingNode[];
  edges: IGradingEdge[];
}

/** One submitted mark, flattened to what the engine needs. */
export interface MarkInput {
  component: CapstoneMarkComponent;
  submitterId: string;
  submitterRole: 'supervisor' | 'evaluator';
  rawScore: number;
  rubricMax: number | null;
}

/** Everything a source node needs to resolve one student's marks. */
export interface StudentContext {
  studentAccountId: string;
  marks: MarkInput[];
  supervisorId: string;
  /** Coordinator-chosen evaluators, per component. */
  chosenEvaluators: Partial<Record<CapstoneMarkComponent, string[]>>;
  /**
   * How the coordinator combined the chosen evaluators for a component on this group -
   * 'mean' (average, the default) or 'max' (best). Overrides the block's own aggregate for
   * chosen-evaluator blocks only; absent means "use the block's setting".
   */
  chosenAggregate?: Partial<Record<CapstoneMarkComponent, 'mean' | 'max'>>;
  /**
   * "Top K": for each student, only their K highest evaluator marks count (averaged), drawn
   * from every evaluator in `chosenEvaluators`. Set per component; absent or 0 means off.
   */
  evaluatorTopK?: Partial<Record<CapstoneMarkComponent, number | null>>;
}

/** A mark's size on its own scale, so marks on different rubrics rank fairly. */
const markFraction = (m: Pick<MarkInput, 'rawScore' | 'rubricMax'>) => (m.rubricMax && m.rubricMax > 0 ? m.rawScore / m.rubricMax : m.rawScore);

/**
 * The evaluator marks "Top K" keeps for one student and component: the K highest, ties broken
 * by evaluator id so the choice is stable. The grades, the "counted" flags on every screen and
 * the exports all use this, so they can never disagree about which marks counted.
 */
export function topKMarks<T extends Pick<MarkInput, 'rawScore' | 'rubricMax' | 'submitterId'>>(marks: T[], k: number): T[] {
  return [...marks]
    .sort((a, b) => markFraction(b) - markFraction(a) || String(a.submitterId).localeCompare(String(b.submitterId)))
    .slice(0, Math.max(0, Math.floor(k)));
}

export interface ValidationIssue {
  nodeId?: string;
  message: string;
}

export interface EvaluationTrace {
  nodeId: string;
  type: string;
  label: string;
  value: number;
  /** Populated for source nodes: how many submissions actually fed this number. */
  contributingSubmissions?: number;
}

export interface EvaluationResult {
  /** The output node's value. */
  score: number;
  /** Letter grade, if the graph routes through a gradeBands node before the output. */
  letter: string | null;
  /** Per-node values, in evaluation order - this is what the UI shows as a breakdown. */
  trace: EvaluationTrace[];
  /** Components that produced no submissions at all, so the UI can flag "not yet graded". */
  missingComponents: CapstoneMarkComponent[];
}

// ── Validation ────────────────────────────────────────────────────────────────────────────

const VALID_AGGREGATES: GradingAggregate[] = ['mean', 'sum', 'max', 'min', 'count'];
const VALID_SCOPES: GradingSubmitterScope[] = ['supervisor', 'chosenEvaluator', 'allEvaluator'];

/**
 * Checks a scheme is structurally sound and safe to evaluate. Returns every problem found
 * rather than the first, so the editor can highlight all broken nodes at once.
 */
export function validateScheme(graph: SchemeGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  if (nodes.length === 0) {
    return [{ message: 'The scheme is empty - add at least a source and an output node.' }];
  }

  const byId = new Map<string, IGradingNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) {
      issues.push({ nodeId: node.id, message: `Duplicate node id "${node.id}".` });
    }
    byId.set(node.id, node);
  }

  // Edges must reference real nodes, or the topological walk below would silently skip work.
  for (const edge of edges) {
    if (!byId.has(edge.source)) {
      issues.push({ message: `Edge "${edge.id}" starts at a node that does not exist.` });
    }
    if (!byId.has(edge.target)) {
      issues.push({ message: `Edge "${edge.id}" ends at a node that does not exist.` });
    }
    if (edge.source === edge.target) {
      issues.push({ nodeId: edge.source, message: 'A node cannot feed into itself.' });
    }
  }

  const outputs = nodes.filter((n) => n.type === 'output');
  if (outputs.length === 0) {
    issues.push({ message: 'The scheme needs exactly one Final Grade (output) node - there is none.' });
  } else if (outputs.length > 1) {
    issues.push({ message: `The scheme has ${outputs.length} Final Grade nodes - there must be exactly one.` });
  }

  const incoming = new Map<string, IGradingEdge[]>();
  for (const edge of edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge);
  }

  for (const node of nodes) {
    const inputs = incoming.get(node.id) || [];
    const data = node.data || {};

    switch (node.type) {
      case 'source': {
        if (inputs.length > 0) {
          issues.push({ nodeId: node.id, message: 'A Component node reads marks directly and cannot take inputs.' });
        }
        if (!GRADING_COMPONENTS.includes(data.component)) {
          issues.push({ nodeId: node.id, message: `Pick a component (one of ${GRADING_COMPONENTS.join(', ')}).` });
        }
        if (!VALID_SCOPES.includes(data.scope)) {
          issues.push({ nodeId: node.id, message: 'Pick who this reads from (supervisor / chosen evaluators / all evaluators).' });
        }
        if (!VALID_AGGREGATES.includes(data.aggregate)) {
          issues.push({ nodeId: node.id, message: 'Pick how to combine multiple submissions (mean / sum / max / min / count).' });
        }
        break;
      }

      case 'constant': {
        if (typeof data.value !== 'number' || !Number.isFinite(data.value)) {
          issues.push({ nodeId: node.id, message: 'A Constant node needs a finite numeric value.' });
        }
        break;
      }

      case 'scale': {
        if (inputs.length !== 1) {
          issues.push({ nodeId: node.id, message: `A Scale node takes exactly 1 input (it has ${inputs.length}).` });
        }
        if (typeof data.factor !== 'number' || !Number.isFinite(data.factor)) {
          issues.push({ nodeId: node.id, message: 'A Scale node needs a finite numeric factor.' });
        }
        break;
      }

      case 'sum': {
        if (inputs.length === 0) {
          issues.push({ nodeId: node.id, message: 'A Sum node needs at least 1 input.' });
        }
        const weights = data.weights || {};
        for (const key of Object.keys(weights)) {
          if (typeof weights[key] !== 'number' || !Number.isFinite(weights[key])) {
            issues.push({ nodeId: node.id, message: `Weight for "${key}" must be a finite number.` });
          }
        }
        break;
      }

      case 'formula': {
        if (typeof data.expression !== 'string' || !data.expression.trim()) {
          issues.push({ nodeId: node.id, message: 'A Formula node needs an expression.' });
          break;
        }
        let used: string[];
        try {
          compileExpression(data.expression);
          used = expressionVariables(data.expression);
        } catch (err) {
          issues.push({
            nodeId: node.id,
            message: err instanceof ExpressionError ? err.message : 'Invalid expression.',
          });
          break;
        }
        // Every variable the expression reads must actually arrive on an edge, otherwise
        // evaluation would throw per-student at grading time.
        const available = new Set(inputs.map((e) => e.targetHandle || 'in'));
        for (const name of used) {
          if (!available.has(name)) {
            issues.push({
              nodeId: node.id,
              message: `Formula uses "${name}" but no input is connected under that name.`,
            });
          }
        }
        break;
      }

      case 'op': {
        // A plain-language math block (lib/gradingBlocks.ts).
        for (const message of blockIssues(String(data.op || ''), data, inputs.map((e) => e.targetHandle || 'in'))) {
          issues.push({ nodeId: node.id, message });
        }
        break;
      }

      case 'gradeBands': {
        if (inputs.length !== 1) {
          issues.push({ nodeId: node.id, message: `A Grade Bands node takes exactly 1 input (it has ${inputs.length}).` });
        }
        const bands = data.bands;
        if (!Array.isArray(bands) || bands.length === 0) {
          issues.push({ nodeId: node.id, message: 'A Grade Bands node needs at least one band.' });
          break;
        }
        for (const band of bands) {
          if (typeof band?.min !== 'number' || !Number.isFinite(band.min)) {
            issues.push({ nodeId: node.id, message: 'Every band needs a finite minimum score.' });
            break;
          }
          if (typeof band?.letter !== 'string' || !band.letter.trim()) {
            issues.push({ nodeId: node.id, message: 'Every band needs a letter.' });
            break;
          }
        }
        break;
      }

      case 'output': {
        if (inputs.length !== 1) {
          issues.push({ nodeId: node.id, message: `The Final Grade node takes exactly 1 input (it has ${inputs.length}).` });
        }
        break;
      }

      default:
        issues.push({ nodeId: node.id, message: `Unknown node type "${node.type}".` });
    }
  }

  // Cycles would make evaluation non-terminating; catch them here rather than at grade time.
  if (findCycle(nodes, edges)) {
    issues.push({ message: 'The scheme contains a loop. Marks must flow one way, from components to the final grade.' });
  }

  return issues;
}

/** Kahn's algorithm; returns true if any node never reaches in-degree zero. */
function findCycle(nodes: IGradingNode[], edges: IGradingEdge[]): boolean {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    if (!indegree.has(edge.target) || !outgoing.has(edge.source)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited += 1;
    for (const next of outgoing.get(id) || []) {
      const d = (indegree.get(next) || 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return visited !== nodes.length;
}

/**
 * The nodes that represent a scheme's final component columns - what a gradebook would show
 * as "Report 34.18 | Presentation 38.80 | Peer 4 | Journal 9" before the total.
 *
 * Walks back from the output through single-input pass-through nodes (output, gradeBands,
 * scale) until it reaches the node that actually combines several values, and returns that
 * node's direct inputs.
 *
 * Doing it structurally matters: naively listing every source node would also emit the raw
 * 0-1 rubric fractions that feed a 60/40 blend, so a sheet would show both
 * "Report - Supervisor: 0.91" and "Report (out of 40): 34.18" and invite the reader to treat
 * an intermediate value as a mark.
 */
export function componentNodeIds(graph: SchemeGraph): string[] {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  const incoming = new Map<string, IGradingEdge[]>();
  for (const edge of edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge);
  }

  const output = nodes.find((n) => n.type === 'output');
  if (!output) return [];

  const PASS_THROUGH = new Set(['output', 'gradeBands', 'scale']);
  let current = output;
  const seen = new Set<string>();

  while (PASS_THROUGH.has(current.type) || (current.type === 'op' && (incoming.get(current.id) || []).length === 1)) {
    // Defensive: validateScheme rejects cycles, but this walk must terminate even if it is
    // ever called on an unvalidated graph.
    if (seen.has(current.id)) return [];
    seen.add(current.id);

    const inputs = incoming.get(current.id) || [];
    if (inputs.length !== 1) break;
    const next = nodes.find((n) => n.id === inputs[0].source);
    if (!next) return [];
    current = next;
  }

  return (incoming.get(current.id) || []).map((e) => e.source);
}

/** Evaluation order, parents before children. Assumes validateScheme found no cycle. */
function topoSort(nodes: IGradingNode[], edges: IGradingEdge[]): IGradingNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: IGradingNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const next of outgoing.get(id) || []) {
      const d = (indegree.get(next) || 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order;
}

// ── Evaluation ────────────────────────────────────────────────────────────────────────────

function aggregate(values: number[], how: GradingAggregate): number {
  if (how === 'count') return values.length;
  // An absent component scores 0 rather than throwing: a student graded before every
  // evaluator has submitted should still get a provisional total, with the gap surfaced
  // separately via `missingComponents`.
  if (values.length === 0) return 0;
  switch (how) {
    case 'mean':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    default:
      return 0;
  }
}

/**
 * Whose supervisor mark counts for a component. Normally the group's current supervisor's. If
 * the supervisor was changed after marking, the previous supervisor's mark is used only while
 * the current one hasn't marked that component - never averaged with it.
 */
export function isCountedSupervisorMark(mark: MarkInput, ctx: Pick<StudentContext, 'marks' | 'supervisorId'>): boolean {
  if (mark.submitterRole !== 'supervisor') return false;
  if (String(mark.submitterId) === String(ctx.supervisorId)) return true;
  return !ctx.marks.some(
    (m) => m.component === mark.component && m.submitterRole === 'supervisor' && String(m.submitterId) === String(ctx.supervisorId)
  );
}

function resolveSource(node: IGradingNode, ctx: StudentContext): { value: number; count: number } {
  const component = node.data.component as CapstoneMarkComponent;
  const scope = node.data.scope as GradingSubmitterScope;
  const groupChoice = scope === 'chosenEvaluator' ? ctx.chosenAggregate?.[component] : undefined;
  const how = (groupChoice || node.data.aggregate) as GradingAggregate;
  // `normalize` turns a raw rubric score into a 0-1 fraction, which is what a downstream
  // Scale node then turns into points. Off means "use the raw score as-is" (peer marks and
  // weekly journal are already on their final scale).
  const normalize = node.data.normalize !== false;

  const chosen = new Set((ctx.chosenEvaluators[component] || []).map(String));

  let relevant = ctx.marks.filter((mark) => {
    if (mark.component !== component) return false;
    if (scope === 'supervisor') return mark.submitterRole === 'supervisor' && isCountedSupervisorMark(mark, ctx);
    if (scope === 'allEvaluator') return mark.submitterRole === 'evaluator';
    // chosenEvaluator: only the evaluators the coordinator picked FOR THIS COMPONENT.
    return mark.submitterRole === 'evaluator' && chosen.has(String(mark.submitterId));
  });
  // Top K: this student's K highest of those, averaged.
  const topK = scope === 'chosenEvaluator' ? ctx.evaluatorTopK?.[component] : null;
  if (topK && topK > 0) relevant = topKMarks(relevant, topK);
  const combine = (topK && topK > 0 ? 'mean' : how) as GradingAggregate;

  const values = relevant.map((mark) => {
    if (!normalize) return mark.rawScore;
    // A rubric component is scaled by the rubric it was marked on (the mark carries it), as
    // the marking plan already does: one scheme pinned to 4098A (report /33) and 4098B
    // (report /42) must not divide a 42-point report by 33. The override is the fallback
    // for marks without a recorded max and for non-rubric components.
    const rubricComponent = component === 'report' || component === 'presentation';
    const max = rubricComponent && mark.rubricMax ? mark.rubricMax : node.data.rubricMaxOverride ?? mark.rubricMax;
    // A missing or zero rubric max would make the fraction meaningless; treat as 0 rather
    // than dividing and producing Infinity.
    if (!max || max <= 0) return 0;
    return mark.rawScore / max;
  });

  return { value: aggregate(values, combine), count: relevant.length };
}

function applyBands(value: number, bands: Array<{ min: number; letter: string }>): string {
  // Highest threshold first, so the first band the score clears is the right one regardless
  // of the order the coordinator happened to add them in.
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  for (const band of sorted) {
    if (value >= band.min) return band.letter;
  }
  return sorted[sorted.length - 1]?.letter ?? 'F';
}

/**
 * Runs the graph for one student. Throws only on a scheme that validateScheme would have
 * rejected - callers should validate before grading a cohort.
 */
export function evaluateScheme(graph: SchemeGraph, ctx: StudentContext): EvaluationResult {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const order = topoSort(nodes, edges);

  const incoming = new Map<string, IGradingEdge[]>();
  for (const edge of edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge);
  }

  const values = new Map<string, number>();
  const trace: EvaluationTrace[] = [];
  const missingComponents = new Set<CapstoneMarkComponent>();
  let letter: string | null = null;
  let outputValue = 0;

  for (const node of order) {
    const inputs = incoming.get(node.id) || [];
    // Inputs keyed by the variable name the edge binds to. Null-prototype so a handle
    // named "constructor" can't collide with an inherited property.
    const named: Record<string, number> = Object.create(null);
    for (const edge of inputs) {
      named[edge.targetHandle || 'in'] = values.get(edge.source) ?? 0;
    }
    const inputValues = inputs.map((e) => values.get(e.source) ?? 0);

    let value = 0;
    let contributingSubmissions: number | undefined;

    switch (node.type) {
      case 'source': {
        const resolved = resolveSource(node, ctx);
        value = resolved.value;
        contributingSubmissions = resolved.count;
        if (resolved.count === 0) {
          missingComponents.add(node.data.component as CapstoneMarkComponent);
        }
        break;
      }
      case 'constant':
        value = Number(node.data.value) || 0;
        break;
      case 'scale':
        value = (inputValues[0] ?? 0) * (Number(node.data.factor) || 0);
        break;
      case 'sum': {
        const weights = node.data.weights || {};
        value = inputs.reduce((total, edge) => {
          const handle = edge.targetHandle || 'in';
          const weight = Object.prototype.hasOwnProperty.call(weights, handle)
            ? Number(weights[handle])
            : 1;
          return total + (values.get(edge.source) ?? 0) * (Number.isFinite(weight) ? weight : 1);
        }, 0);
        break;
      }
      case 'formula':
        value = compileExpression(node.data.expression)(named);
        break;
      case 'op':
        value = evaluateBlock(String(node.data.op || ''), node.data, named, inputValues);
        break;
      case 'gradeBands': {
        const input = inputValues[0] ?? 0;
        letter = applyBands(input, node.data.bands || []);
        // A bands node is a pass-through for the number so the output node still receives
        // the score; the letter travels alongside on the result.
        value = input;
        break;
      }
      case 'output':
        value = inputValues[0] ?? 0;
        outputValue = value;
        break;
      default:
        value = 0;
    }

    values.set(node.id, value);
    trace.push({
      nodeId: node.id,
      type: node.type,
      label: node.data.label || node.type,
      value,
      ...(contributingSubmissions !== undefined ? { contributingSubmissions } : {}),
    });
  }

  return {
    score: Number.isFinite(outputValue) ? outputValue : 0,
    letter,
    trace,
    missingComponents: [...missingComponents],
  };
}

/**
 * Report rubric maximum per track, = criteria count x 3 in the department's rubric docs.
 * 4098A has 11 criteria (33), 4098B has 14 (42).
 *
 * 4098C has no published rubric yet ("4098c grading is pending" in the source docs), so it
 * provisionally follows B, the other continuation course. This is a placeholder, not a
 * department decision - confirm before grading a real C cohort.
 */
const REPORT_MAX: Record<'A' | 'B' | 'C', number> = { A: 33, B: 42, C: 42 };

/**
 * Top grade-band cutoff per track. A and B genuinely differ in the source gradebooks (98 vs
 * 95); the docs flag this as more likely an inconsistency between the two course files than
 * intentional policy, so it is encoded as-is and left visible in the editor for the
 * department to correct rather than silently normalised.
 */
const A_PLUS_CUTOFF: Record<'A' | 'B' | 'C', number> = { A: 98, B: 95, C: 95 };

/**
 * The CSE4098 scheme from docs/capstone-marking-and-rubrics.md, as a starting graph.
 *
 * Report 40% and Presentation 45% each blend supervisor 60% / chosen-evaluator-average 40%
 * of the normalised rubric fraction; peer (0-5) and weekly journal (0-10) are already on
 * their final scale and go in raw.
 */
export function defaultCseScheme(track: 'A' | 'B' | 'C' = 'A'): SchemeGraph {
  const reportMax = REPORT_MAX[track];
  const aPlusCutoff = A_PLUS_CUTOFF[track];

  const nodes: IGradingNode[] = [
    {
      id: 'report_sup',
      type: 'source',
      position: { x: 0, y: 0 },
      data: { label: 'Report — Supervisor', component: 'report', scope: 'supervisor', aggregate: 'mean', normalize: true, rubricMaxOverride: reportMax },
    },
    {
      id: 'report_eval',
      type: 'source',
      position: { x: 0, y: 130 },
      data: { label: 'Report — Chosen Evaluators', component: 'report', scope: 'chosenEvaluator', aggregate: 'mean', normalize: true, rubricMaxOverride: reportMax },
    },
    {
      id: 'report_blend',
      type: 'formula',
      position: { x: 300, y: 65 },
      // As the workbook: each part is rounded to 2 places before the 60/40 blend.
      data: { label: 'Report (out of 40)', expression: 'round(0.6 * round(40 * sup, 2) + 0.4 * round(40 * ev, 2), 2)' },
    },
    {
      id: 'pres_sup',
      type: 'source',
      position: { x: 0, y: 280 },
      data: { label: 'Presentation — Supervisor', component: 'presentation', scope: 'supervisor', aggregate: 'mean', normalize: true, rubricMaxOverride: 45 },
    },
    {
      id: 'pres_eval',
      type: 'source',
      position: { x: 0, y: 410 },
      data: { label: 'Presentation — Chosen Evaluators', component: 'presentation', scope: 'chosenEvaluator', aggregate: 'mean', normalize: true, rubricMaxOverride: 45 },
    },
    {
      id: 'pres_blend',
      type: 'formula',
      position: { x: 300, y: 345 },
      // As the workbook: blended on a 50-mark scale, then capped at 45.
      data: { label: 'Presentation (out of 45)', expression: 'min(45, round(50 * (0.6 * sup + 0.4 * ev), 2))' },
    },
    {
      id: 'peer',
      type: 'source',
      position: { x: 300, y: 500 },
      data: { label: 'Peer Mark (0-5)', component: 'peer', scope: 'supervisor', aggregate: 'mean', normalize: false },
    },
    {
      id: 'journal',
      type: 'source',
      position: { x: 300, y: 620 },
      data: { label: 'Weekly Journal (0-10)', component: 'weeklyJournal', scope: 'supervisor', aggregate: 'mean', normalize: false },
    },
    {
      id: 'total',
      type: 'sum',
      position: { x: 620, y: 330 },
      data: { label: 'Total (out of 100)', weights: {} },
    },
    {
      id: 'bands',
      type: 'gradeBands',
      position: { x: 900, y: 330 },
      data: {
        label: 'Letter Grade',
        bands: [
          { min: aPlusCutoff, letter: 'A+' },
          { min: 85, letter: 'A' },
          { min: 80, letter: 'A-' },
          { min: 75, letter: 'B+' },
          { min: 70, letter: 'B' },
          { min: 65, letter: 'B-' },
          { min: 60, letter: 'C+' },
          { min: 55, letter: 'C' },
          { min: 50, letter: 'D' },
          { min: 0, letter: 'F' },
        ],
      },
    },
    {
      id: 'final',
      type: 'output',
      position: { x: 1180, y: 330 },
      data: { label: 'Final Grade' },
    },
  ];

  const edges: IGradingEdge[] = [
    { id: 'e1', source: 'report_sup', target: 'report_blend', targetHandle: 'sup' },
    { id: 'e2', source: 'report_eval', target: 'report_blend', targetHandle: 'ev' },
    { id: 'e3', source: 'pres_sup', target: 'pres_blend', targetHandle: 'sup' },
    { id: 'e4', source: 'pres_eval', target: 'pres_blend', targetHandle: 'ev' },
    { id: 'e5', source: 'report_blend', target: 'total', targetHandle: 'report' },
    { id: 'e6', source: 'pres_blend', target: 'total', targetHandle: 'presentation' },
    { id: 'e7', source: 'peer', target: 'total', targetHandle: 'peer' },
    { id: 'e8', source: 'journal', target: 'total', targetHandle: 'journal' },
    { id: 'e9', source: 'total', target: 'bands', targetHandle: 'in' },
    { id: 'e10', source: 'bands', target: 'final', targetHandle: 'in' },
  ];

  return { nodes, edges };
}
