'use client';

import type { Node, Edge } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Plus, Info, Users, ExternalLink } from 'lucide-react';
import { inputName } from './nodes';

/**
 * Side panel for editing the selected node. Kept out of the node renderers themselves so
 * the canvas stays readable at a glance and form state lives in one place.
 */

const COMPONENTS = [
  { value: 'report', label: 'Report' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'peer', label: 'Peer Mark' },
  { value: 'weeklyJournal', label: 'Weekly Journal' },
  { value: 'poster', label: 'Poster' },
];

const SCOPES = [
  { value: 'supervisor', label: 'Supervisor only', hint: "The group's assigned supervisor." },
  {
    value: 'chosenEvaluator',
    label: 'Chosen evaluators',
    hint: 'Only evaluators the coordinator marked as counting for this component.',
  },
  {
    value: 'allEvaluator',
    label: 'All evaluators',
    hint: 'Every assigned evaluator who submitted, chosen or not.',
  },
];

const AGGREGATES = [
  { value: 'mean', label: 'Average' },
  { value: 'sum', label: 'Sum' },
  { value: 'max', label: 'Highest' },
  { value: 'min', label: 'Lowest' },
  { value: 'count', label: 'Count of submissions' },
];

interface Props {
  node: Node | null;
  edges: Edge[];
  /** Node id -> its label, so an input can say which block it came from. */
  sourceLabels: Record<string, string>;
  readOnly: boolean;
  onChange: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  /** Renames the variable an edge binds to. */
  onRenameInput?: (edgeId: string) => void;
  /** Appends a variable name to the selected formula's expression. */
  onInsertVariable?: (name: string) => void;
  /** Where to send the user to pick which evaluators actually count, per group. */
  groupsHref?: string;
}

export function NodeInspector({
  node,
  edges,
  sourceLabels,
  readOnly,
  onChange,
  onDelete,
  onRenameInput,
  onInsertVariable,
  groupsHref,
}: Props) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Select a block on the canvas to edit it, or drag a new one in from the palette above.
        </p>
      </div>
    );
  }

  const data = node.data as Record<string, any>;
  const set = (patch: Record<string, unknown>) => onChange(node.id, { ...data, ...patch });

  // Input names arriving at this node - these are the variables a formula may reference and
  // the keys a sum node may weight. Showing them removes the guesswork of matching an edge
  // label to an expression variable.
  const incomingEdges = edges.filter((e) => e.target === node.id);
  const incomingHandles = incomingEdges.map(inputName);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label htmlFor="node-label">Label</Label>
          <Input
            id="node-label"
            value={data.label || ''}
            disabled={readOnly}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="Shown on the block"
          />
        </div>

        {incomingHandles.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
              <Info className="h-3.5 w-3.5" />
              {node.type === 'formula' ? 'Variables you can use' : 'Inputs arriving here'}
            </p>
            <div className="space-y-1.5">
              {incomingEdges.map((edge) => {
                const handle = inputName(edge);
                return (
                  <div key={edge.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={readOnly || node.type !== 'formula'}
                      onClick={() => onInsertVariable?.(handle)}
                      title={
                        node.type === 'formula'
                          ? 'Insert into the expression'
                          : undefined
                      }
                      className={`shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-border ${
                        node.type === 'formula' && !readOnly
                          ? 'cursor-pointer hover:ring-primary'
                          : 'cursor-default'
                      }`}
                    >
                      {handle}
                    </button>
                    <span className="truncate text-[11px] text-muted-foreground">
                      from {sourceLabels[edge.source] || edge.source}
                    </span>
                    {!readOnly && onRenameInput && (
                      <button
                        type="button"
                        onClick={() => onRenameInput(edge.id)}
                        className="ml-auto shrink-0 text-[11px] text-primary hover:underline"
                      >
                        rename
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {node.type === 'formula' && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Click a variable to drop it into the expression.
              </p>
            )}
          </div>
        )}

        {node.type === 'source' && (
          <>
            <div className="space-y-1.5">
              <Label>Component</Label>
              <Select
                value={data.component || 'report'}
                disabled={readOnly}
                onValueChange={(v) => set({ component: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENTS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Read marks from</Label>
              <Select
                value={data.scope || 'supervisor'}
                disabled={readOnly}
                onValueChange={(v) => set({ scope: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {SCOPES.find((s) => s.value === (data.scope || 'supervisor'))?.hint}
              </p>

              {/* The block decides WHICH KIND of grader to read from; WHICH PEOPLE count is
                  a per-group decision, because every group has a different panel. That
                  split is the thing that isn't obvious from the canvas, so say it here and
                  link straight to where the choice is made. */}
              {data.scope === 'chosenEvaluator' && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Users className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      This block reads only the evaluators picked as counting for{' '}
                      <strong className="text-foreground">
                        {COMPONENTS.find((c) => c.value === (data.component || 'report'))?.label}
                      </strong>
                      . That pick is made per group, not here — a group with six evaluators
                      keeps all six marks on record, but only the chosen ones reach this
                      block.
                    </span>
                  </p>
                  {groupsHref && (
                    <a
                      href={groupsHref}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      Choose evaluators per group
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              {data.scope === 'allEvaluator' && (
                <p className="rounded-lg border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                  Every assigned evaluator counts, including any the coordinator did not
                  pick. Use <strong className="text-foreground">Chosen evaluators</strong> if
                  a group may be evaluated by more people than should be graded on.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Combine multiple submissions by</Label>
              <Select
                value={data.aggregate || 'mean'}
                disabled={readOnly}
                onValueChange={(v) => set({ aggregate: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGGREGATES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Score form</Label>
              <Select
                value={data.normalize === false ? 'raw' : 'fraction'}
                disabled={readOnly}
                onValueChange={(v) => set({ normalize: v === 'fraction' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fraction">Fraction of rubric max (0–1)</SelectItem>
                  <SelectItem value="raw">Raw score, as submitted</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {data.normalize === false
                  ? 'Use for marks already on their final scale, like peer (0–5) and weekly journal (0–10).'
                  : 'Divides by the rubric maximum so a later Scale or Formula can turn it into points.'}
              </p>
            </div>

            {data.normalize !== false && (
              <div className="space-y-1.5">
                <Label htmlFor="rubric-max">Rubric maximum override</Label>
                <Input
                  id="rubric-max"
                  type="number"
                  value={data.rubricMaxOverride ?? ''}
                  disabled={readOnly}
                  placeholder="Use each submission's own max"
                  onChange={(e) =>
                    set({
                      rubricMaxOverride: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to divide by whatever max each submission recorded. Set it (33 for
                  4098A report, 42 for 4098B, 45 for presentation) to pin the denominator.
                </p>
              </div>
            )}
          </>
        )}

        {node.type === 'constant' && (
          <div className="space-y-1.5">
            <Label htmlFor="const-value">Value</Label>
            <Input
              id="const-value"
              type="number"
              value={data.value ?? 0}
              disabled={readOnly}
              onChange={(e) => set({ value: Number(e.target.value) })}
            />
          </div>
        )}

        {node.type === 'scale' && (
          <div className="space-y-1.5">
            <Label htmlFor="scale-factor">Multiply by</Label>
            <Input
              id="scale-factor"
              type="number"
              step="any"
              value={data.factor ?? 1}
              disabled={readOnly}
              onChange={(e) => set({ factor: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">
              e.g. 40 turns a 0–1 fraction into a mark out of 40.
            </p>
          </div>
        )}

        {node.type === 'formula' && (
          <div className="space-y-1.5">
            <Label htmlFor="formula-expr">Expression</Label>
            <Input
              id="formula-expr"
              value={data.expression || ''}
              disabled={readOnly}
              className="font-mono text-sm"
              onChange={(e) => set({ expression: e.target.value })}
              placeholder="round(40 * (0.6 * sup + 0.4 * ev), 2)"
            />
            <p className="text-[11px] text-muted-foreground">
              Use the input names listed above as variables. Available functions: min, max,
              round, floor, ceil, abs, sqrt, clamp, if.
            </p>
          </div>
        )}

        {node.type === 'sum' && (
          <div className="space-y-2">
            <Label>Input weights</Label>
            {incomingHandles.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Connect something into this block first.
              </p>
            ) : (
              incomingHandles.map((handle) => (
                <div key={handle} className="flex items-center gap-2">
                  <code className="w-24 shrink-0 truncate font-mono text-[11px]">{handle}</code>
                  <Input
                    type="number"
                    step="any"
                    disabled={readOnly}
                    value={data.weights?.[handle] ?? 1}
                    onChange={(e) =>
                      set({ weights: { ...(data.weights || {}), [handle]: Number(e.target.value) } })
                    }
                  />
                </div>
              ))
            )}
            <p className="text-[11px] text-muted-foreground">
              Defaults to 1, which is a plain addition.
            </p>
          </div>
        )}

        {node.type === 'gradeBands' && (
          <div className="space-y-2">
            <Label>Bands</Label>
            <p className="text-[11px] text-muted-foreground">
              A score gets the letter of the highest band it reaches. Order does not matter.
            </p>
            {((data.bands || []) as Array<{ min: number; letter: string }>).map((band, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="w-20"
                  disabled={readOnly}
                  value={band.letter}
                  onChange={(e) => {
                    const bands = [...(data.bands || [])];
                    bands[i] = { ...bands[i], letter: e.target.value };
                    set({ bands });
                  }}
                />
                <span className="shrink-0 text-xs text-muted-foreground">≥</span>
                <Input
                  type="number"
                  step="any"
                  disabled={readOnly}
                  value={band.min}
                  onChange={(e) => {
                    const bands = [...(data.bands || [])];
                    bands[i] = { ...bands[i], min: Number(e.target.value) };
                    set({ bands });
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={readOnly}
                  aria-label="Remove this grade band"
                  title="Remove this grade band"
                  onClick={() => set({ bands: (data.bands || []).filter((_: unknown, j: number) => j !== i) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={readOnly}
              onClick={() => set({ bands: [...(data.bands || []), { min: 0, letter: 'New' }] })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add band
            </Button>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="mt-auto border-t p-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => onDelete(node.id)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete this block
          </Button>
        </div>
      )}
    </div>
  );
}
