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
} from 'lucide-react';

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
