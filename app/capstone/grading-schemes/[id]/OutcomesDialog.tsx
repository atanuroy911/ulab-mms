'use client';

import { Plus, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PO_KEYS,
  RUBRIC_CRITERION_MAX,
  defaultOutcomes,
  outcomeMax,
  rubricLabels,
  taggedCriteria,
  validateOutcomes,
  type CapstoneOutcome,
  type CapstoneOutcomesConfig,
  type OutcomeSource,
  type ComponentOutcomeSource,
} from '@/lib/capstoneOutcomes';

/**
 * Edits the scheme's course outcomes: what each CO is measured from, which POs it maps to,
 * and the attainment thresholds. These drive the course file's CO/PO sheets and are
 * published with the scheme, like the graph.
 */

const MEASURES: Array<{ value: string; label: string; source: OutcomeSource }> = [
  { value: 'rubric:report', label: 'Report rubric criteria tagged with this CO', source: { kind: 'rubric', component: 'report' } },
  { value: 'rubric:presentation', label: 'Presentation rubric criteria tagged with this CO', source: { kind: 'rubric', component: 'presentation' } },
  { value: 'component:report', label: 'Report mark, scaled', source: { kind: 'component', component: 'report', max: 10 } },
  { value: 'component:presentation', label: 'Presentation mark, scaled', source: { kind: 'component', component: 'presentation', max: 10 } },
  { value: 'component:peer', label: 'Peer mark, scaled', source: { kind: 'component', component: 'peer', max: 5 } },
  { value: 'component:weeklyJournal', label: 'Weekly journal mark, scaled', source: { kind: 'component', component: 'weeklyJournal', max: 10 } },
  { value: 'component:poster', label: 'Poster mark, scaled', source: { kind: 'component', component: 'poster', max: 10 } },
];

const measureValue = (s: OutcomeSource) => `${s.kind}:${s.component}`;

export function OutcomesDialog({
  open,
  onOpenChange,
  value,
  readOnly,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CapstoneOutcomesConfig;
  readOnly: boolean;
  onChange: (next: CapstoneOutcomesConfig) => void;
}) {
  // Rubric tags and the CO->PO mapping differ by track, so COs are written for one track.
  const track = value.track;
  const issues = validateOutcomes(value, track);

  const update = (idx: number, patch: Partial<CapstoneOutcome>) =>
    onChange({ ...value, outcomes: value.outcomes.map((o, i) => (i === idx ? { ...o, ...patch } : o)) });

  const nextKey = () => {
    const used = new Set(value.outcomes.map((o) => o.key.toUpperCase()));
    let n = 1;
    while (used.has(`CO${n}`)) n += 1;
    return `CO${n}`;
  };

  const setThreshold = (key: keyof CapstoneOutcomesConfig['thresholds'], percent: string) =>
    onChange({ ...value, thresholds: { ...value.thresholds, [key]: Number(percent) / 100 } });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Course outcomes (COs)</DialogTitle>
          <DialogDescription>
            How each CO is measured and which programme outcomes it maps to. Used by the course file&apos;s CO-PO
            sheets; saved with the draft and published with the scheme.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Written for</span>
            <Select
              value={track}
              disabled={readOnly}
              onValueChange={(t) => onChange({ ...value, track: t as 'A' | 'B' | 'C' })}
            >
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['A', 'B', 'C'] as const).map((t) => (
                  <SelectItem key={t} value={t}>
                    Capstone {t} (4098{t})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              Rubric tags come from this track&apos;s rubric. Other tracks using this scheme get their department defaults.
            </span>
          </div>

          {value.outcomes.map((o, idx) => {
            const src = o.source;
            const tagged = src.kind === 'rubric' ? taggedCriteria(src.component, track, o.key) : [];
            const labels = src.kind === 'rubric' ? rubricLabels(src.component, track) : [];
            return (
              <div key={idx} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={o.key}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { key: e.target.value.toUpperCase().replace(/\s/g, '') })}
                    className="h-8 w-20 font-mono"
                    aria-label="CO key"
                  />
                  <Input
                    value={o.description || ''}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    placeholder="Description (optional)"
                    className="h-8 min-w-0 flex-1 basis-40"
                  />
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={`Remove ${o.key}`}
                      onClick={() => onChange({ ...value, outcomes: value.outcomes.filter((_, i) => i !== idx) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Select
                    value={measureValue(src)}
                    disabled={readOnly}
                    onValueChange={(v) => {
                      const m = MEASURES.find((x) => x.value === v);
                      if (m) update(idx, { source: { ...m.source } });
                    }}
                  >
                    <SelectTrigger className="h-8 w-full min-w-0 sm:w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEASURES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {src.kind === 'component' ? (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      out of
                      <Input
                        type="number"
                        min={1}
                        value={src.max}
                        disabled={readOnly}
                        onChange={(e) => update(idx, { source: { ...src, max: Number(e.target.value) } })}
                        className="h-8 w-20"
                      />
                    </label>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {tagged.length} criteri{tagged.length === 1 ? 'on' : 'a'} × {RUBRIC_CRITERION_MAX[src.component]} ={' '}
                      <strong className="text-foreground">out of {outcomeMax(o, track)}</strong>
                    </span>
                  )}
                </div>
                {src.kind === 'rubric' && tagged.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {tagged.map((i) => labels[i].replace(/\s*\[CO[^\]]*\]/gi, '')).join(' · ')}
                  </p>
                )}

                {/* An optional second measure, added on top (e.g. 4098C CO5 = report criteria + poster). */}
                {o.also ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">plus</span>
                    <Select
                      value={o.also.component}
                      disabled={readOnly}
                      onValueChange={(v) => update(idx, { also: { ...o.also!, component: v as ComponentOutcomeSource['component'] } })}
                    >
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEASURES.filter((m) => m.source.kind === 'component').map((m) => (
                          <SelectItem key={m.value} value={(m.source as ComponentOutcomeSource).component}>
                            {m.label.replace(', scaled', '')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-muted-foreground">
                      scaled to
                      <Input
                        type="number"
                        min={1}
                        value={o.also.max}
                        disabled={readOnly}
                        onChange={(e) => update(idx, { also: { ...o.also!, max: Number(e.target.value) } })}
                        className="h-8 w-20"
                      />
                    </label>
                    <span className="text-muted-foreground">
                      = <strong className="text-foreground">out of {outcomeMax(o, track)}</strong> in total
                    </span>
                    {!readOnly && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => update(idx, { also: null })}>
                        Remove
                      </Button>
                    )}
                  </div>
                ) : (
                  !readOnly && (
                    <button
                      type="button"
                      className="mt-1.5 text-xs text-primary hover:underline"
                      onClick={() => update(idx, { also: { kind: 'component', component: 'poster', max: 10 } })}
                    >
                      + Add another measure (e.g. the poster)
                    </button>
                  )
                )}

                <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={`POs for ${o.key}`}>
                  {PO_KEYS.map((po) => {
                    const on = o.pos.includes(po);
                    return (
                      <button
                        key={po}
                        type="button"
                        disabled={readOnly}
                        aria-pressed={on}
                        onClick={() => update(idx, { pos: on ? o.pos.filter((p) => p !== po) : [...o.pos, po] })}
                        className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-default ${
                          on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {po}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange({
                    ...value,
                    outcomes: [...value.outcomes, { key: nextKey(), source: { kind: 'rubric', component: 'report' }, pos: [] }],
                  })
                }
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add CO
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onChange(defaultOutcomes(track))}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reset to department defaults
              </Button>
            </div>
          )}

          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
            {(
              [
                ['co', 'Student attains a CO at'],
                ['po', 'Student attains a PO at'],
                ['classTarget', 'Class meets a CO when attained by'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={Math.round(value.thresholds[key] * 1000) / 10}
                    disabled={readOnly}
                    onChange={(e) => setThreshold(key, e.target.value)}
                    className="h-8 w-20"
                  />
                  <span className="text-xs text-muted-foreground">{key === 'classTarget' ? '% of students' : '% of marks'}</span>
                </div>
              </div>
            ))}
          </div>

          {issues.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Fix before saving
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
