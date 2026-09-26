// Plain-language math blocks for grading schemes (node type `op`). Each block does one small
// thing a coordinator can read as a sentence - "Take 60% of", "Round to 2 places", "Cap at
// 45" - so a scheme can be built without writing a formula. Client-safe: the engine, the
// canvas, the inspector and the formula <-> blocks converters all read this one catalog.
//
// Inputs come in two shapes:
//   - named ports, for operations where order matters ("Subtract": start with / take away),
//     each taking exactly one connection;
//   - one "many" port, for operations over any number of inputs ("Add", "Average").
// Numbers that are settings rather than marks (the 60, the 2, the 45) are params, typed in
// the side panel, never wired in.

export type BlockCategory = 'arithmetic' | 'rounding' | 'combine' | 'convert' | 'logic';

export interface BlockPort {
  id: string;
  /** What the port means, shown next to it on the block: "take away", "by". */
  label: string;
}

export interface BlockParam {
  key: string;
  label: string;
  default: number;
  /** Shown under the field. */
  hint?: string;
  integer?: boolean;
  min?: number;
}

export interface BlockDef {
  op: string;
  category: BlockCategory;
  /** Short name in the library: "Take a percentage". */
  title: string;
  /** One line explaining it. */
  description: string;
  /** Extra words people might search for. */
  keywords: string[];
  /** Named ports, or 'many' for any number of inputs. */
  inputs: BlockPort[] | 'many';
  /** The fewest connections a 'many' block needs. */
  minInputs?: number;
  params: BlockParam[];
  /** The sentence shown on the block, e.g. "Take 60% of". */
  sentence: (p: Record<string, number>) => string;
  evaluate: (ports: Record<string, number>, all: number[], p: Record<string, number>) => number;
}

const roundTo = (x: number, places: number) => {
  const f = Math.pow(10, places);
  return Math.round(x * f) / f;
};
const fmt = (n: number) => String(Math.round(n * 10000) / 10000);
const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

export const BLOCKS: BlockDef[] = [
  // ── Arithmetic ────────────────────────────────────────────────────────────────────
  {
    op: 'add',
    category: 'arithmetic',
    title: 'Add',
    description: 'Adds all connected values together.',
    keywords: ['plus', 'sum', 'total', '+'],
    inputs: 'many',
    minInputs: 1,
    params: [],
    sentence: () => 'Add together',
    evaluate: (_p, all) => all.reduce((a, b) => a + b, 0),
  },
  {
    op: 'subtract',
    category: 'arithmetic',
    title: 'Subtract',
    description: 'Starts with one value and takes another away.',
    keywords: ['minus', 'difference', '-', 'less'],
    inputs: [
      { id: 'a', label: 'start with' },
      { id: 'b', label: 'take away' },
    ],
    params: [],
    sentence: () => 'Subtract',
    evaluate: (p) => (p.a ?? 0) - (p.b ?? 0),
  },
  {
    op: 'multiply',
    category: 'arithmetic',
    title: 'Multiply',
    description: 'Multiplies all connected values together.',
    keywords: ['times', 'product', '*', 'x'],
    inputs: 'many',
    minInputs: 1,
    params: [],
    sentence: () => 'Multiply together',
    evaluate: (_p, all) => all.reduce((a, b) => a * b, 1),
  },
  {
    op: 'divide',
    category: 'arithmetic',
    title: 'Divide',
    description: 'Divides one value by another (dividing by 0 gives 0).',
    keywords: ['over', 'ratio', '/', 'fraction'],
    inputs: [
      { id: 'a', label: 'divide' },
      { id: 'b', label: 'by' },
    ],
    params: [],
    sentence: () => 'Divide',
    evaluate: (p) => safeDiv(p.a ?? 0, p.b ?? 0),
  },
  {
    op: 'percentOf',
    category: 'arithmetic',
    title: 'Take a percentage',
    description: 'Takes a share of a value - "60% of the supervisor mark".',
    keywords: ['percent', 'weight', 'share', 'portion', '%'],
    inputs: [{ id: 'in', label: 'of' }],
    params: [{ key: 'percent', label: 'Percentage', default: 60, hint: 'e.g. 60 for 60%' }],
    sentence: (p) => `Take ${fmt(p.percent)}% of`,
    evaluate: (p, _a, q) => (p.in ?? 0) * (q.percent / 100),
  },
  {
    op: 'multiplyBy',
    category: 'arithmetic',
    title: 'Multiply by a number',
    description: 'Multiplies a value by a fixed number.',
    keywords: ['times', 'scale', 'factor'],
    inputs: [{ id: 'in', label: 'value' }],
    params: [{ key: 'by', label: 'Multiply by', default: 1 }],
    sentence: (p) => `Multiply by ${fmt(p.by)}`,
    evaluate: (p, _a, q) => (p.in ?? 0) * q.by,
  },
  {
    op: 'divideBy',
    category: 'arithmetic',
    title: 'Divide by a number',
    description: 'Divides a value by a fixed number.',
    keywords: ['over', 'split'],
    inputs: [{ id: 'in', label: 'value' }],
    params: [{ key: 'by', label: 'Divide by', default: 1 }],
    sentence: (p) => `Divide by ${fmt(p.by)}`,
    evaluate: (p, _a, q) => safeDiv(p.in ?? 0, q.by),
  },
  {
    op: 'addNumber',
    category: 'arithmetic',
    title: 'Add a number',
    description: 'Adds a fixed number (use a negative number to subtract).',
    keywords: ['plus', 'bonus', 'offset'],
    inputs: [{ id: 'in', label: 'value' }],
    params: [{ key: 'n', label: 'Add', default: 0 }],
    sentence: (p) => (p.n < 0 ? `Subtract ${fmt(-p.n)}` : `Add ${fmt(p.n)}`),
    evaluate: (p, _a, q) => (p.in ?? 0) + q.n,
  },

  // ── Rounding & limits ─────────────────────────────────────────────────────────────
  {
    op: 'round',
    category: 'rounding',
    title: 'Round',
    description: 'Rounds to a number of decimal places, like ROUND() in Excel.',
    keywords: ['decimal', 'places', 'nearest'],
    inputs: [{ id: 'in', label: 'value' }],
    params: [{ key: 'places', label: 'Decimal places', default: 2, integer: true, min: 0 }],
    sentence: (p) => (p.places === 0 ? 'Round to a whole number' : `Round to ${p.places} decimal place${p.places === 1 ? '' : 's'}`),
    evaluate: (p, _a, q) => roundTo(p.in ?? 0, q.places),
  },
  {
    op: 'roundUp',
    category: 'rounding',
    title: 'Round up',
    description: 'Always rounds up to a whole number.',
    keywords: ['ceil', 'ceiling'],
    inputs: [{ id: 'in', label: 'value' }],
    params: [],
    sentence: () => 'Round up',
    evaluate: (p) => Math.ceil(p.in ?? 0),
  },
  {
    op: 'roundDown',
    category: 'rounding',
    title: 'Round down',
    description: 'Always rounds down to a whole number.',
    keywords: ['floor', 'truncate'],
    inputs: [{ id: 'in', label: 'value' }],
    params: [],
    sentence: () => 'Round down',
    evaluate: (p) => Math.floor(p.in ?? 0),
  },
  {
    op: 'atMost',
    category: 'rounding',
    title: 'Cap at a maximum',
    description: 'Never lets a value go above a limit - "no more than 45".',
    keywords: ['max', 'limit', 'ceiling', 'cap', 'min'],
    inputs: [{ id: 'in', label: 'value' }],
    params: [{ key: 'max', label: 'At most', default: 100 }],
    sentence: (p) => `Cap at ${fmt(p.max)}`,
    evaluate: (p, _a, q) => Math.min(p.in ?? 0, q.max),
  },
  {
    op: 'atLeast',
    category: 'rounding',
    title: 'At least',
    description: 'Never lets a value go below a limit.',
    keywords: ['min', 'floor', 'minimum', 'max'],
    inputs: [{ id: 'in', label: 'value' }],
    params: [{ key: 'min', label: 'At least', default: 0 }],
    sentence: (p) => `At least ${fmt(p.min)}`,
    evaluate: (p, _a, q) => Math.max(p.in ?? 0, q.min),
  },
  {
    op: 'between',
    category: 'rounding',
    title: 'Keep between',
    description: 'Keeps a value between a lowest and a highest limit.',
    keywords: ['clamp', 'range', 'limit'],
    inputs: [{ id: 'in', label: 'value' }],
    params: [
      { key: 'min', label: 'Lowest', default: 0 },
      { key: 'max', label: 'Highest', default: 100 },
    ],
    sentence: (p) => `Keep between ${fmt(p.min)} and ${fmt(p.max)}`,
    evaluate: (p, _a, q) => Math.min(Math.max(p.in ?? 0, q.min), q.max),
  },

  // ── Combine ───────────────────────────────────────────────────────────────────────
  {
    op: 'average',
    category: 'combine',
    title: 'Average',
    description: 'The average of all connected values.',
    keywords: ['mean', 'avg'],
    inputs: 'many',
    minInputs: 1,
    params: [],
    sentence: () => 'Average of',
    evaluate: (_p, all) => (all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0),
  },
  {
    op: 'highest',
    category: 'combine',
    title: 'Highest',
    description: 'The highest of all connected values.',
    keywords: ['max', 'maximum', 'best', 'largest'],
    inputs: 'many',
    minInputs: 1,
    params: [],
    sentence: () => 'Highest of',
    evaluate: (_p, all) => (all.length ? Math.max(...all) : 0),
  },
  {
    op: 'lowest',
    category: 'combine',
    title: 'Lowest',
    description: 'The lowest of all connected values.',
    keywords: ['min', 'minimum', 'smallest', 'worst'],
    inputs: 'many',
    minInputs: 1,
    params: [],
    sentence: () => 'Lowest of',
    evaluate: (_p, all) => (all.length ? Math.min(...all) : 0),
  },

  // ── Convert ───────────────────────────────────────────────────────────────────────
  {
    op: 'rescale',
    category: 'convert',
    title: 'Change "out of"',
    description: 'Converts a mark to a different total - 30 out of 33 becomes 36.36 out of 40.',
    keywords: ['scale', 'convert', 'out of', 'normalise', 'normalize', 'proportion'],
    inputs: [{ id: 'in', label: 'mark' }],
    params: [
      { key: 'from', label: 'Now out of', default: 100 },
      { key: 'to', label: 'Make it out of', default: 100 },
    ],
    sentence: (p) => `Change "out of ${fmt(p.from)}" to "out of ${fmt(p.to)}"`,
    evaluate: (p, _a, q) => safeDiv((p.in ?? 0) * q.to, q.from),
  },

  // ── Logic ─────────────────────────────────────────────────────────────────────────
  {
    op: 'ifAtLeast',
    category: 'logic',
    title: 'If at least… then… otherwise…',
    description: 'Picks one of two values depending on whether another reaches a threshold.',
    keywords: ['if', 'condition', 'pass', 'threshold', 'choose'],
    inputs: [
      { id: 'value', label: 'if this' },
      { id: 'then', label: 'then use' },
      { id: 'else', label: 'otherwise use' },
    ],
    params: [{ key: 'threshold', label: 'is at least', default: 50 }],
    sentence: (p) => `If at least ${fmt(p.threshold)}`,
    evaluate: (p, _a, q) => ((p.value ?? 0) >= q.threshold ? (p.then ?? 0) : (p.else ?? 0)),
  },
];

export const BLOCK_BY_OP: Record<string, BlockDef> = Object.fromEntries(BLOCKS.map((b) => [b.op, b]));

export const BLOCK_CATEGORY_LABEL: Record<BlockCategory, string> = {
  arithmetic: 'Arithmetic',
  rounding: 'Rounding & limits',
  combine: 'Combine',
  convert: 'Convert',
  logic: 'Logic',
};

/** A block's params with defaults filled in. */
export function blockParams(def: BlockDef, data: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of def.params) {
    const v = Number(data?.[p.key]);
    out[p.key] = Number.isFinite(v) ? v : p.default;
  }
  return out;
}

/** Evaluates one block. `named` maps port id -> value; `all` is every input, in edge order. */
export function evaluateBlock(op: string, data: Record<string, unknown>, named: Record<string, number>, all: number[]): number {
  const def = BLOCK_BY_OP[op];
  if (!def) return 0;
  const v = def.evaluate(named, all, blockParams(def, data));
  return Number.isFinite(v) ? v : 0;
}

/** Problems with one block given the port names of its incoming edges. */
export function blockIssues(op: string, data: Record<string, unknown>, incomingPorts: string[]): string[] {
  const def = BLOCK_BY_OP[op];
  if (!def) return [`Unknown block "${op}".`];
  const issues: string[] = [];
  if (def.inputs === 'many') {
    if (incomingPorts.length < (def.minInputs ?? 1)) issues.push(`"${def.title}" needs at least ${def.minInputs ?? 1} input.`);
  } else {
    for (const port of def.inputs) {
      const n = incomingPorts.filter((p) => p === port.id).length;
      if (n === 0) issues.push(`"${def.title}": connect something to "${port.label}".`);
      if (n > 1) issues.push(`"${def.title}": "${port.label}" can take only one input.`);
    }
    const known = new Set(def.inputs.map((p) => p.id));
    if (incomingPorts.some((p) => !known.has(p))) issues.push(`"${def.title}" has an input that isn't plugged into one of its slots.`);
  }
  for (const p of def.params) {
    const v = Number(data?.[p.key]);
    if (data?.[p.key] !== undefined && !Number.isFinite(v)) issues.push(`"${def.title}": "${p.label}" must be a number.`);
    if (p.integer && Number.isFinite(v) && !Number.isInteger(v)) issues.push(`"${def.title}": "${p.label}" must be a whole number.`);
    if (p.min !== undefined && Number.isFinite(v) && v < p.min) issues.push(`"${def.title}": "${p.label}" must be at least ${p.min}.`);
  }
  return issues;
}
