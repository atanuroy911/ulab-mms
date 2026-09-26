'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Info, Loader2, Minus, Plus, Save, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Component = 'presentation' | 'poster' | 'report';
type Mode = 'all' | 'topK' | 'pick';
interface Rule {
  mode: Mode;
  k: number | null;
  how: 'mean' | 'max';
}
interface Draft {
  mode: Mode;
  k: number;
  how: 'mean' | 'max';
  picked: string[];
}
interface Payload {
  canChoose: boolean;
  /** The parts this group's scheme takes evaluator marks for, in order. */
  choosable: Component[];
  scheme: { name: string; version: number | null } | null;
  evaluators: { id: string; name: string | null }[];
  components: Record<Component, { max: number | null; blocks: { label: string; scope: string; aggregate: string }[]; saved: Rule; rule: Rule; picked: string[] }>;
  students: {
    id: string;
    name: string | null;
    studentId: string;
    now: { score: number | null; letter: string | null };
    preview: { score: number | null; letter: string | null };
    marks: { component: string; evaluatorId: string; raw: number; max: number | null; counted: boolean }[];
    combined: Record<Component, number | null>;
  }[];
}

const LABELS: Record<Component, string> = { presentation: 'Presentation', poster: 'Poster', report: 'Report' };
const MIN_PICKED = 2;
const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(digits));

const toDraft = (rule: Rule, picked: string[], evaluatorCount: number): Draft => ({
  mode: rule.mode,
  k: rule.k ?? Math.min(2, Math.max(evaluatorCount, 1)),
  how: rule.how,
  picked: rule.mode === 'pick' ? picked : [],
});
/** What the server calls this draft (preview body and saved fields agree). */
const toRule = (d: Draft) =>
  d.mode === 'topK' ? { chosen: [], topK: d.k } : d.mode === 'pick' ? { chosen: d.picked, how: d.how, topK: null } : { chosen: [], how: d.how, topK: null };
const same = (a: Draft, b: Draft) =>
  a.mode === b.mode &&
  (a.mode !== 'topK' || a.k === b.k) &&
  (a.mode === 'topK' || a.how === b.how) &&
  (a.mode !== 'pick' || [...a.picked].sort().join() === [...b.picked].sort().join());

/**
 * Step 2 of the Manage tab: once the marks are in, the coordinator sees every evaluator's
 * presentation and report marks and decides how they count - all evaluators, each student's
 * top K, or picked evaluators - with each student's grade previewed under the grading scheme
 * before saving.
 */
export function EvaluatorChoicePanel({ groupId, onSaved }: { groupId: string; onSaved: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [drafts, setDrafts] = useState<Record<Component, Draft> | null>(null);
  const [saved, setSaved] = useState<Record<Component, Draft> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  // The first drafts come straight from the server - no preview needed for them.
  const skipPreview = useRef(true);

  const fetchChoice = useCallback(
    async (rules?: Record<Component, ReturnType<typeof toRule>>) => {
      const mine = ++requestId.current;
      const res = await fetch(`/api/capstone/groups/${groupId}/evaluator-choice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules ? { rules } : {}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load evaluator marks');
      // A slower, older preview must not overwrite a newer one.
      if (mine !== requestId.current) return null;
      return body as Payload;
    },
    [groupId]
  );

  const reload = useCallback(async () => {
    try {
      const body = await fetchChoice();
      if (!body) return;
      const initial = Object.fromEntries(
        body.choosable.map((key) => [key, toDraft(body.components[key].saved, body.components[key].picked, body.evaluators.length)])
      ) as Record<Component, Draft>;
      skipPreview.current = true;
      setData(body);
      setDrafts(initial);
      setSaved(initial);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evaluator marks');
    }
  }, [fetchChoice]);

  useEffect(() => {
    reload();
  }, [reload]);

  const shown = useMemo(() => (drafts ? (Object.keys(drafts) as Component[]) : []), [drafts]);
  const dirty = useMemo(() => !!drafts && !!saved && shown.some((key) => !same(drafts[key], saved[key])), [drafts, saved, shown]);

  // Preview the draft a moment after the last change.
  useEffect(() => {
    if (!drafts || !saved) return;
    if (skipPreview.current) {
      skipPreview.current = false;
      return;
    }
    const t = window.setTimeout(async () => {
      setPreviewing(true);
      try {
        const body = await fetchChoice(Object.fromEntries(shown.map((key) => [key, toRule(drafts[key])])) as Record<Component, ReturnType<typeof toRule>>);
        if (body) setData(body);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        setPreviewing(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
    // Only a change to the drafts triggers a preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  const update = (c: Component, patch: Partial<Draft>) => setDrafts((prev) => (prev ? { ...prev, [c]: { ...prev[c], ...patch } } : prev));

  const problems = useMemo(() => {
    if (!drafts || !data) return [] as string[];
    const n = data.evaluators.length;
    return shown.flatMap((key) => {
      const label = LABELS[key];
      const d = drafts[key];
      if (d.mode === 'pick' && d.picked.length < Math.min(MIN_PICKED, n)) return [`${label}: pick at least ${Math.min(MIN_PICKED, n)} evaluators`];
      if (d.mode === 'topK' && (d.k < 1 || d.k > n)) return [`${label}: K must be 1 to ${n}`];
      return [];
    });
  }, [drafts, data, shown]);

  const save = async () => {
    if (!drafts || problems.length) return;
    setSaving(true);
    try {
      const chosenEvaluators: Record<string, string[]> = {};
      const chosenAggregate: Record<string, 'mean' | 'max'> = {};
      const evaluatorTopK: Record<string, number | null> = {};
      for (const key of shown) {
        const d = drafts[key];
        chosenEvaluators[key] = d.mode === 'pick' ? d.picked : [];
        if (d.mode !== 'topK') chosenAggregate[key] = d.how;
        evaluatorTopK[key] = d.mode === 'topK' ? d.k : null;
      }
      const res = await fetch(`/api/capstone/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosenEvaluators, chosenAggregate, evaluatorTopK }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save');
      toast.success('Saved - grades now use this choice');
      await reload();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data || !drafts) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading every evaluator&apos;s marks…
      </div>
    );
  }
  if (data.evaluators.length === 0) return <p className="text-sm text-muted-foreground">No active evaluators are assigned to this group.</p>;

  const gradeChanged = data.students.some((s) => s.now.score !== s.preview.score || s.now.letter !== s.preview.letter);

  return (
    <div className="space-y-8">
      {shown.map((key) => {
        const label = LABELS[key];
        const comp = data.components[key];
        const d = drafts[key];
        const n = data.evaluators.length;
        const chosenBlocks = comp.blocks.filter((b) => b.scope === 'chosenEvaluator');
        const otherBlocks = comp.blocks.filter((b) => b.scope === 'allEvaluator');
        const missing = data.students.reduce(
          (sum, s) => sum + data.evaluators.filter((e) => !s.marks.some((m) => m.component === key && m.evaluatorId === e.id)).length,
          0
        );
        return (
          <section key={key} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">
                {label}
                {comp.max ? <span className="ml-1.5 font-normal text-muted-foreground">marked out of {comp.max}</span> : null}
              </h4>
              {missing > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                  {missing} evaluator mark{missing === 1 ? '' : 's'} still missing
                </span>
              )}
            </div>

            {/* Where this choice goes in the grading scheme */}
            {data.scheme ? (
              chosenBlocks.length > 0 ? (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {data.scheme.name}
                    {data.scheme.version ? ` v${data.scheme.version}` : ''} reads this as{' '}
                    {chosenBlocks.map((b, i) => (
                      <span key={b.label}>
                        {i > 0 && ', '}
                        <strong className="font-medium text-foreground">{b.label}</strong>
                      </span>
                    ))}
                    , so your choice below sets that input.
                  </span>
                </p>
              ) : (
                <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {otherBlocks.length > 0
                    ? `${data.scheme.name} reads ${label.toLowerCase()} from every evaluator, so this choice doesn't change grades.`
                    : `${data.scheme.name} doesn't use evaluators' ${label.toLowerCase()} marks, so this choice doesn't change grades.`}
                </p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">No grading scheme is pinned to this track yet - grades can&apos;t be previewed.</p>
            )}

            {/* The rule */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border p-0.5 text-xs" role="radiogroup" aria-label={`Which ${label} evaluators count`}>
                {(
                  [
                    ['all', 'All evaluators', 'Every evaluator on the group counts'],
                    ['topK', 'Top K', "For each student, only their K highest evaluator marks count, averaged"],
                    ['pick', 'Pick evaluators', 'Only the evaluators you tick count'],
                  ] as const
                ).map(([mode, text, tip]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={d.mode === mode}
                    title={tip}
                    onClick={() => update(key, { mode, picked: mode === 'pick' && d.picked.length === 0 ? data.evaluators.map((e) => e.id) : d.picked })}
                    className={cn(
                      'rounded-md px-3 py-1.5 font-medium transition-colors',
                      d.mode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {d.mode === 'topK' ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">K =</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => update(key, { k: Math.max(1, d.k - 1) })} disabled={d.k <= 1} aria-label="Fewer">
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-sm font-semibold tabular-nums">{d.k}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => update(key, { k: Math.min(n, d.k + 1) })} disabled={d.k >= n} aria-label="More">
                    <Plus className="h-3 w-3" />
                  </Button>
                  <span className="text-muted-foreground">
                    of {n} · each student&apos;s {d.k === 1 ? 'highest mark' : `${d.k} highest marks, averaged`}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Combine by</span>
                  <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label={`How to combine ${label} evaluators`}>
                    {(
                      [
                        ['mean', 'Average'],
                        ['max', 'Best'],
                      ] as const
                    ).map(([how, text]) => (
                      <button
                        key={how}
                        type="button"
                        role="radio"
                        aria-checked={d.how === how}
                        onClick={() => update(key, { how })}
                        className={cn('rounded px-2.5 py-0.5 font-medium transition-colors', d.how === how ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Every evaluator's marks; the ones that count are highlighted */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs">
                    <th className="px-3 py-2 font-medium text-muted-foreground">Student</th>
                    {data.evaluators.map((e) => {
                      const picked = d.picked.includes(e.id);
                      return (
                        <th key={e.id} className="px-2 py-2 text-center font-medium">
                          {d.mode === 'pick' ? (
                            <button
                              type="button"
                              aria-pressed={picked}
                              onClick={() => update(key, { picked: picked ? d.picked.filter((x) => x !== e.id) : [...d.picked, e.id] })}
                              title={picked ? 'Counted - click to stop counting' : 'Not counted - click to count'}
                              className={cn(
                                'inline-flex max-w-36 items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                                picked ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                              )}
                            >
                              {picked ? <Check className="h-3 w-3 shrink-0" /> : <Plus className="h-3 w-3 shrink-0" />}
                              <span className="truncate">{e.name || 'Evaluator'}</span>
                            </button>
                          ) : (
                            <span className="block max-w-36 truncate" title={e.name || undefined}>
                              {e.name || 'Evaluator'}
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <th className="border-l px-3 py-2 text-right font-medium">Counts as</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        <span className="block max-w-48 truncate">{s.name || s.studentId}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{s.studentId}</span>
                      </td>
                      {data.evaluators.map((e) => {
                        const m = s.marks.find((x) => x.component === key && x.evaluatorId === e.id);
                        return (
                          <td key={e.id} className="px-2 py-1.5 text-center tabular-nums">
                            {m ? (
                              <span
                                className={cn(
                                  'inline-block min-w-10 rounded px-1.5 py-0.5',
                                  m.counted ? 'bg-primary/15 font-semibold text-foreground' : 'text-muted-foreground line-through decoration-muted-foreground/40'
                                )}
                                title={m.counted ? 'Counts' : "Doesn't count"}
                              >
                                {fmt(m.raw)}
                              </span>
                            ) : (
                              <span className="text-amber-600" title="Not marked yet">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="border-l px-3 py-1.5 text-right font-semibold tabular-nums">
                        {fmt(s.combined[key])}
                        {comp.max ? <span className="font-normal text-muted-foreground">/{comp.max}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* The result under the grading scheme */}
      {data.scheme && (
        <section className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            Final grade{dirty ? ' - saved vs. this choice' : ''}
            {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.students.map((s) => {
              const changed = s.now.score !== s.preview.score || s.now.letter !== s.preview.letter;
              return (
                <div key={s.id} className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm', changed && 'border-primary/50 bg-primary/5')}>
                  <span className="min-w-0 truncate">{s.name || s.studentId}</span>
                  <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                    {changed && (
                      <>
                        <span className="text-muted-foreground line-through">
                          {fmt(s.now.score, 2)} {s.now.letter}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      </>
                    )}
                    <strong>{fmt(s.preview.score, 2)}</strong>
                    <span className="rounded bg-muted px-1.5 text-xs font-semibold">{s.preview.letter || '—'}</span>
                  </span>
                </div>
              );
            })}
          </div>
          {dirty && !gradeChanged && !previewing && <p className="text-xs text-muted-foreground">This change doesn&apos;t move any grade.</p>}
        </section>
      )}

      {/* Save */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {problems.length > 0 ? (
          <span className="text-xs text-destructive">{problems.join(' · ')}</span>
        ) : dirty ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">Not saved yet - grades still use the saved choice.</span>
        ) : (
          <span className="text-xs text-muted-foreground">Saved. Grades, exports and the course file use this.</span>
        )}
        <div className="ml-auto flex gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => saved && setDrafts(saved)} disabled={saving}>
              <Undo2 className="mr-1.5 h-4 w-4" /> Undo
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || saving || problems.length > 0}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save choice
          </Button>
        </div>
      </div>
    </div>
  );
}
