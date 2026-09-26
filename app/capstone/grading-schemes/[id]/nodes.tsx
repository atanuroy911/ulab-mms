'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Users,
  Database,
  Hash,
  X as TimesIcon,
  Sigma,
  FunctionSquare,
  Award,
  Flag,
  AlertCircle,
  Plus,
  Calculator,
  Ruler,
  Layers,
  ArrowRightLeft,
  GitBranch,
} from 'lucide-react';
import { BLOCKS, BLOCK_BY_OP, BLOCK_CATEGORY_LABEL, blockParams, type BlockCategory } from '@/lib/gradingBlocks';

/**
 * Node renderers for the grading-scheme canvas.
 *
 * Each node shows the value it will produce in plain language, so a coordinator can read
 * the arithmetic off the canvas without opening an inspector. Editing happens in the side
 * panel; these are display-only plus connection handles.
 */

const COMPONENT_LABELS: Record<string, string> = {
  report: 'Report',
  presentation: 'Presentation',
  peer: 'Peer Mark',
  weeklyJournal: 'Weekly Journal',
  poster: 'Poster',
};

const SCOPE_LABELS: Record<string, string> = {
  supervisor: 'Supervisor',
  chosenEvaluator: 'Chosen evaluators',
  allEvaluator: 'All evaluators',
};

const AGGREGATE_LABELS: Record<string, string> = {
  mean: 'average',
  sum: 'total',
  max: 'highest',
  min: 'lowest',
  count: 'count of',
};

interface ShellProps {
  selected?: boolean;
  invalid?: boolean;
  accent: string;
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}

function NodeShell({ selected, invalid, accent, icon, title, children }: ShellProps) {
  return (
    <div
      className={`min-w-[190px] max-w-[260px] rounded-xl border bg-card shadow-sm transition-all ${
        selected ? 'ring-2 ring-primary border-primary' : 'border-border'
      } ${invalid ? 'border-destructive ring-1 ring-destructive/40' : ''}`}
    >
      <div className={`flex items-center gap-2 rounded-t-xl px-3 py-2 text-xs font-semibold ${accent}`}>
        {icon}
        <span className="truncate">{title}</span>
        {invalid && <AlertCircle className="ml-auto h-3.5 w-3.5 shrink-0" />}
      </div>
      {children && <div className="px-3 py-2 text-xs text-muted-foreground space-y-0.5">{children}</div>}
    </div>
  );
}

// Handles are sized up a little from the React Flow default: the default 6px dot is
// genuinely hard to hit on a laptop trackpad, and connecting nodes is the core interaction.
const handleClass = '!h-3 !w-3 !border-2 !border-background !bg-primary';

export const SourceNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, any>;
  return (
    <>
      <NodeShell
        selected={selected}
        invalid={d.__invalid}
        accent="bg-sky-500/10 text-sky-700 dark:text-sky-300"
        icon={<Database className="h-3.5 w-3.5 shrink-0" />}
        title={d.label || 'Component'}
      >
        <p>
          {AGGREGATE_LABELS[d.aggregate] || d.aggregate} of{' '}
          <strong className="text-foreground">{SCOPE_LABELS[d.scope] || d.scope}</strong>
        </p>
        <p>
          on <strong className="text-foreground">{COMPONENT_LABELS[d.component] || d.component}</strong>
        </p>
        <p className="text-[11px] opacity-80">
          {d.normalize === false
            ? 'raw score'
            : `÷ ${d.rubricMaxOverride ?? 'rubric max'} (fraction)`}
        </p>
        {/* Flagged on the canvas because it is the one setting whose real value lives
            elsewhere (per group), so it is worth seeing without opening the inspector. */}
        {d.scope === 'chosenEvaluator' && (
          <p className="mt-1 inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            <Users className="h-2.5 w-2.5" />
            picked per group
          </p>
        )}
      </NodeShell>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </>
  );
});
SourceNode.displayName = 'SourceNode';

export const ConstantNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, any>;
  return (
    <>
      <NodeShell
        selected={selected}
        invalid={d.__invalid}
        accent="bg-slate-500/10 text-slate-700 dark:text-slate-300"
        icon={<Hash className="h-3.5 w-3.5 shrink-0" />}
        title={d.label || 'Constant'}
      >
        <p className="text-lg font-semibold text-foreground">{d.value ?? 0}</p>
      </NodeShell>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </>
  );
});
ConstantNode.displayName = 'ConstantNode';

/**
 * The variable name an edge binds to on its target. Kept in edge.data rather than
 * targetHandle: nodes expose a single target handle, and React Flow refuses to draw an
 * edge whose targetHandle doesn't match a rendered handle id.
 */
export function inputName(edge: { data?: Record<string, unknown>; targetHandle?: string | null }): string {
  const name = edge.data?.input;
  return (typeof name === 'string' && name) || edge.targetHandle || 'in';
}

export const ScaleNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, any>;
  return (
    <>
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      <NodeShell
        selected={selected}
        invalid={d.__invalid}
        accent="bg-violet-500/10 text-violet-700 dark:text-violet-300"
        icon={<TimesIcon className="h-3.5 w-3.5 shrink-0" />}
        title={d.label || 'Scale'}
      >
        <p>
          input × <strong className="text-foreground">{d.factor ?? 1}</strong>
        </p>
      </NodeShell>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </>
  );
});
ScaleNode.displayName = 'ScaleNode';

export const SumNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, any>;
  const weights = (d.weights || {}) as Record<string, number>;
  const weighted = Object.entries(weights).filter(([, w]) => w !== 1);
  return (
    <>
      <Handle type="target" position={Position.Left} className={handleClass} />
      <NodeShell
        selected={selected}
        invalid={d.__invalid}
        accent="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        icon={<Sigma className="h-3.5 w-3.5 shrink-0" />}
        title={d.label || 'Sum'}
      >
        {weighted.length === 0 ? (
          <p>adds every input</p>
        ) : (
          weighted.map(([key, w]) => (
            <p key={key}>
              {key} × <strong className="text-foreground">{w}</strong>
            </p>
          ))
        )}
      </NodeShell>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </>
  );
});
SumNode.displayName = 'SumNode';

export const FormulaNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, any>;
  return (
    <>
      <Handle type="target" position={Position.Left} className={handleClass} />
      <NodeShell
        selected={selected}
        invalid={d.__invalid}
        accent="bg-amber-500/10 text-amber-700 dark:text-amber-300"
        icon={<FunctionSquare className="h-3.5 w-3.5 shrink-0" />}
        title={d.label || 'Formula'}
      >
        <code className="block break-words rounded bg-muted px-1.5 py-1 font-mono text-[11px] text-foreground">
          {d.expression || '—'}
        </code>
      </NodeShell>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </>
  );
});
FormulaNode.displayName = 'FormulaNode';

export const GradeBandsNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, any>;
  const bands = (d.bands || []) as Array<{ min: number; letter: string }>;
  const top = [...bands].sort((a, b) => b.min - a.min).slice(0, 3);
  return (
    <>
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      <NodeShell
        selected={selected}
        invalid={d.__invalid}
        accent="bg-rose-500/10 text-rose-700 dark:text-rose-300"
        icon={<Award className="h-3.5 w-3.5 shrink-0" />}
        title={d.label || 'Grade Bands'}
      >
        {top.map((band) => (
          <p key={band.letter}>
            <strong className="text-foreground">{band.letter}</strong> ≥ {band.min}
          </p>
        ))}
        {bands.length > 3 && <p className="opacity-70">+{bands.length - 3} more</p>}
      </NodeShell>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </>
  );
});
GradeBandsNode.displayName = 'GradeBandsNode';

export const OutputNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, any>;
  return (
    <>
      <Handle type="target" position={Position.Left} id="in" className={handleClass} />
      <NodeShell
        selected={selected}
        invalid={d.__invalid}
        accent="bg-primary/15 text-primary"
        icon={<Flag className="h-3.5 w-3.5 shrink-0" />}
        title={d.label || 'Final Grade'}
      >
        <p>the student&apos;s final mark</p>
      </NodeShell>
    </>
  );
});
OutputNode.displayName = 'OutputNode';

export const nodeTypes = {
  source: SourceNode,
  constant: ConstantNode,
  scale: ScaleNode,
  sum: SumNode,
  formula: FormulaNode,
  gradeBands: GradeBandsNode,
  output: OutputNode,
};

/** Palette metadata shared by the toolbar and the default data for newly-added nodes. */
export const NODE_PALETTE = [
  {
    type: 'source',
    label: 'Component',
    description: 'Pulls submitted marks for one component',
    icon: Database,
    defaults: {
      label: 'New Component',
      component: 'report',
      scope: 'supervisor',
      aggregate: 'mean',
      normalize: true,
    },
  },
  {
    type: 'formula',
    label: 'Formula',
    description: 'Combines inputs with arithmetic',
    icon: FunctionSquare,
    defaults: { label: 'New Formula', expression: 'a' },
  },
  {
    type: 'sum',
    label: 'Sum',
    description: 'Adds inputs, optionally weighted',
    icon: Sigma,
    defaults: { label: 'Sum', weights: {} },
  },
  {
    type: 'scale',
    label: 'Scale',
    description: 'Multiplies one input by a factor',
    icon: TimesIcon,
    defaults: { label: 'Scale', factor: 1 },
  },
  {
    type: 'constant',
    label: 'Constant',
    description: 'A fixed number',
    icon: Hash,
    defaults: { label: 'Constant', value: 0 },
  },
  {
    type: 'gradeBands',
    label: 'Grade Bands',
    description: 'Turns a score into a letter',
    icon: Award,
    defaults: {
      label: 'Letter Grade',
      bands: [
        { min: 90, letter: 'A' },
        { min: 80, letter: 'B' },
        { min: 70, letter: 'C' },
        { min: 60, letter: 'D' },
        { min: 0, letter: 'F' },
      ],
    },
  },
  {
    type: 'output',
    label: 'Final Grade',
    description: 'Where the result comes out (exactly one)',
    icon: Flag,
    defaults: { label: 'Final Grade' },
  },
] as const;

// ── Plain-language math blocks (node type `op`, lib/gradingBlocks.ts) ─────────────────

const OP_ACCENT: Record<BlockCategory, string> = {
  arithmetic: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  rounding: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
  combine: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  convert: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  logic: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
};

export const OP_ICON: Record<BlockCategory, typeof Plus> = {
  arithmetic: Calculator,
  rounding: Ruler,
  combine: Layers,
  convert: ArrowRightLeft,
  logic: GitBranch,
};

/**
 * A math block reads as a sentence ("Take 60% of"), and each input with a role gets its own
 * labelled plug on the left edge ("start with" / "take away"), so order can't be mixed up.
 */
export const OpNode = memo(({ data, selected }: NodeProps) => {
  const d = data as Record<string, any>;
  const def = BLOCK_BY_OP[d.op];
  if (!def) {
    return (
      <NodeShell selected={selected} invalid accent="bg-destructive/10 text-destructive" icon={<AlertCircle className="h-3.5 w-3.5" />} title="Unknown block" />
    );
  }
  const Icon = OP_ICON[def.category];
  const ports = def.inputs === 'many' ? null : def.inputs;
  const sentence = def.sentence(blockParams(def, d));
  // Plugs line up with their labels: header ~34px, body padding 8px, then 22px per row.
  const rowTop = (i: number) => 53 + i * 22;
  return (
    <>
      {ports ? (
        ports.map((p, i) => (
          <Handle key={p.id} type="target" position={Position.Left} id={p.id} className={handleClass} style={{ top: rowTop(i) }} />
        ))
      ) : (
        <Handle type="target" position={Position.Left} className={handleClass} />
      )}
      <NodeShell
        selected={selected}
        invalid={d.__invalid}
        accent={OP_ACCENT[def.category]}
        icon={<Icon className="h-3.5 w-3.5 shrink-0" />}
        title={d.label && d.label !== def.title ? d.label : def.title}
      >
        {ports ? (
          ports.map((p) => (
            <p key={p.id} className="flex h-[22px] items-center text-[11px]">
              ← {p.label}
            </p>
          ))
        ) : (
          <p className="text-[11px]">← any number of inputs</p>
        )}
        <p className="pt-1 text-sm font-semibold text-foreground">{sentence}</p>
      </NodeShell>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </>
  );
});
OpNode.displayName = 'OpNode';

(nodeTypes as Record<string, unknown>).op = OpNode;

// ── The block library: everything a scheme can be built from, grouped and searchable ──

export interface LibraryItem {
  key: string;
  type: string;
  title: string;
  description: string;
  keywords: string[];
  icon: typeof Plus;
  group: string;
  defaults: Record<string, unknown>;
}

const markPreset = (key: string, title: string, description: string, component: string, scope: string, normalize: boolean): LibraryItem => ({
  key,
  type: 'source',
  title,
  description,
  keywords: [component, scope, 'mark', 'marks', 'component', 'score'],
  icon: Database,
  group: 'Marks',
  defaults: { label: title, component, scope, aggregate: 'mean', normalize },
});

export const LIBRARY_GROUPS = ['Marks', 'Numbers', 'Arithmetic', 'Rounding & limits', 'Combine', 'Convert', 'Logic', 'Result', 'Advanced'] as const;

export const BLOCK_LIBRARY: LibraryItem[] = [
  // Every marking field, ready to drop in.
  markPreset('m-report-sup', 'Report · Supervisor', 'The supervisor report rubric mark, as a fraction (0-1).', 'report', 'supervisor', true),
  markPreset('m-report-ev', 'Report · Evaluators', 'The evaluators report marks averaged, as a fraction (0-1).', 'report', 'chosenEvaluator', true),
  markPreset('m-pres-sup', 'Presentation · Supervisor', 'The supervisor presentation mark, as a fraction (0-1).', 'presentation', 'supervisor', true),
  markPreset('m-pres-ev', 'Presentation · Evaluators', 'The evaluators presentation marks averaged, as a fraction (0-1).', 'presentation', 'chosenEvaluator', true),
  markPreset('m-peer', 'Peer mark', 'The peer mark as entered (0-5).', 'peer', 'supervisor', false),
  markPreset('m-journal', 'Weekly journal mark', 'The weekly journal mark as entered (0-10).', 'weeklyJournal', 'supervisor', false),
  markPreset('m-poster-sup', 'Poster · Supervisor', 'The supervisor poster mark, as entered.', 'poster', 'supervisor', false),
  markPreset('m-poster-ev', 'Poster · Evaluators', 'The evaluators poster marks averaged, as entered.', 'poster', 'allEvaluator', false),
  {
    key: 'm-custom',
    type: 'source',
    title: 'Any mark…',
    description: 'Pick the component and who it comes from in the settings panel.',
    keywords: ['component', 'source', 'custom'],
    icon: Database,
    group: 'Marks',
    defaults: { label: 'Mark', component: 'report', scope: 'supervisor', aggregate: 'mean', normalize: true },
  },
  {
    key: 'number',
    type: 'constant',
    title: 'Number',
    description: 'A fixed number, e.g. 45.',
    keywords: ['constant', 'value', 'fixed'],
    icon: Hash,
    group: 'Numbers',
    defaults: { label: 'Number', value: 0 },
  },
  ...BLOCKS.map(
    (b): LibraryItem => ({
      key: `op-${b.op}`,
      type: 'op',
      title: b.title,
      description: b.description,
      keywords: b.keywords,
      icon: OP_ICON[b.category],
      group: BLOCK_CATEGORY_LABEL[b.category],
      defaults: { op: b.op, label: b.title, ...Object.fromEntries(b.params.map((p) => [p.key, p.default])) },
    })
  ),
  {
    key: 'bands',
    type: 'gradeBands',
    title: 'Letter grade',
    description: 'Turns the total into a letter (A+, A, A-, ...).',
    keywords: ['grade', 'bands', 'letter', 'gpa'],
    icon: Award,
    group: 'Result',
    defaults: { ...(NODE_PALETTE.find((p) => p.type === 'gradeBands')!.defaults as Record<string, unknown>) },
  },
  {
    key: 'final',
    type: 'output',
    title: 'Final grade',
    description: 'Where the result comes out - exactly one per scheme.',
    keywords: ['output', 'result', 'end'],
    icon: Flag,
    group: 'Result',
    defaults: { label: 'Final Grade' },
  },
  {
    key: 'formula',
    type: 'formula',
    title: 'Formula',
    description: 'Write the arithmetic as text. Can be turned into blocks and back.',
    keywords: ['expression', 'equation', 'custom', 'excel'],
    icon: FunctionSquare,
    group: 'Advanced',
    defaults: { label: 'Formula', expression: 'a' },
  },
  {
    key: 'weighted-sum',
    type: 'sum',
    title: 'Weighted total',
    description: 'Adds inputs, each with its own weight.',
    keywords: ['sum', 'total', 'weights'],
    icon: Sigma,
    group: 'Advanced',
    defaults: { label: 'Total', weights: {} },
  },
];

/** The fixed plugs of a block, if it has any (to wire saved connections back onto them). */
export function portIdsOf(type: string | undefined, data: Record<string, unknown> | undefined): string[] {
  if (type !== 'op') return [];
  const def = BLOCK_BY_OP[String(data?.op)];
  return def && def.inputs !== 'many' ? def.inputs.map((p) => p.id) : [];
}

/** "take away" for the Subtract block's `b` plug; null for blocks without named plugs. */
export function portLabel(type: string | undefined, data: Record<string, unknown> | undefined, port: string): string | null {
  if (type !== 'op') return null;
  const def = BLOCK_BY_OP[String(data?.op)];
  if (!def || def.inputs === 'many') return null;
  return def.inputs.find((p) => p.id === port)?.label ?? null;
}
