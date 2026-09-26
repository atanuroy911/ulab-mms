'use client';

import { useCallback, useEffect, useMemo, useRef, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Lock, Save, Search, Undo2, UserCheck, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TeacherShell } from '@/app/components/TeacherShell';
import { Tip } from '@/app/components/Tip';
import { cn } from '@/lib/utils';
import { GroupModal } from '../../../components/GroupModal';

type Role = 'supervisor' | 'evaluator';
interface Requirement {
  component: string;
  max: number;
}
interface Plan {
  supervisor: Requirement[];
  evaluator: Requirement[];
}
interface Grader {
  id: string;
  name: string;
  role: Role;
  current: boolean;
}
interface Group {
  id: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  chosenEvaluators: { presentation: string[]; report: string[]; poster: string[] };
  evaluatorTopK?: { presentation: number | null; report: number | null; poster: number | null };
  students: { id: string; name: string; studentId: string }[];
  graders: Grader[];
}
interface Mark {
  groupId: string;
  studentId: string;
  component: string;
  graderId: string;
  score: number;
  hasRubric: boolean;
  byCoordinator: boolean;
}
interface Payload {
  session: { id: string; label: string; status: string; editable: boolean };
  plans: Record<string, Plan>;
  groups: Group[];
  marks: Mark[];
}

const LABEL: Record<string, string> = {
  presentation: 'Presentation',
  report: 'Report',
  peer: 'Peer',
  weeklyJournal: 'Weekly journal',
  poster: 'Poster',
};
const ORDER = ['presentation', 'report', 'peer', 'weeklyJournal', 'poster'];

const cellKey = (groupId: string, graderId: string, studentId: string, component: string) => `${groupId}|${graderId}|${studentId}|${component}`;

/**
 * Every group's marks in one table, for coordinators and admins: pick a component, and type
 * each grader's marks straight in - supervisor and evaluators side by side, whether or not
 * you grade the group yourself. Saved as that grader's marks, noted as entered by you.
 */
export default function SessionMarksEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState('presentation');
  const [track, setTrack] = useState('all');
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/capstone/sessions/${id}/marks-entry`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load marks');
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marks');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = Object.keys(edits).length;
  // Don't lose typed marks to an accidental tab close.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const markByKey = useMemo(() => {
    const m = new Map<string, Mark>();
    for (const mark of data?.marks || []) m.set(cellKey(mark.groupId, mark.graderId, mark.studentId, mark.component), mark);
    return m;
  }, [data]);

  /** Components some track's scheme asks for, in a fixed order. */
  const components = useMemo(() => {
    const set = new Set<string>();
    for (const p of Object.values(data?.plans || {})) for (const r of [...p.supervisor, ...p.evaluator]) set.add(r.component);
    return ORDER.filter((c) => set.has(c)).concat([...set].filter((c) => !ORDER.includes(c)));
  }, [data]);

  // The picked component, or the first one this session's schemes use.
  const component = components.includes(picked) || components.length === 0 ? picked : components[0];

  const tracks = useMemo(() => [...new Set((data?.groups || []).map((g) => g.track))], [data]);

  /** Who gives this component in a group, and the scale. */
  const columnsFor = useCallback(
    (g: Group) => {
      const plan = data?.plans[g.track];
      if (!plan) return [];
      return g.graders
        .map((gr) => ({ grader: gr, req: plan[gr.role].find((r) => r.component === component) }))
        .filter((c): c is { grader: Grader; req: Requirement } => !!c.req)
        // Former graders only when they actually left marks for this component.
        .filter((c) => c.grader.current || g.students.some((s) => markByKey.has(cellKey(g.id, c.grader.id, s.id, component))));
    },
    [data, component, markByKey]
  );

  const counts = (g: Group, gr: Grader) => {
    if (!gr.current) return false;
    if (gr.role === 'supervisor') return true;
    if (component !== 'presentation' && component !== 'report' && component !== 'poster') return true;
    // Top K: every evaluator's marks are in the running (each student's K highest count).
    if (g.evaluatorTopK?.[component]) return true;
    const chosen = g.chosenEvaluators[component];
    return chosen.length === 0 || chosen.includes(gr.id);
  };

  const missingIn = useCallback(
    (g: Group) =>
      columnsFor(g)
        .filter((c) => c.grader.current && counts(g, c.grader))
        .reduce((n, c) => n + g.students.filter((s) => !markByKey.has(cellKey(g.id, c.grader.id, s.id, component))).length, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnsFor, markByKey, component]
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.groups || []).filter((g) => {
      if (track !== 'all' && g.track !== track) return false;
      if (columnsFor(g).length === 0) return false;
      if (onlyMissing && missingIn(g) === 0) return false;
      if (!q) return true;
      return [g.projectTitle, `#${g.groupNumber}`, ...g.students.flatMap((s) => [s.name, s.studentId]), ...g.graders.map((x) => x.name)]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [data, track, query, onlyMissing, columnsFor, missingIn]);

  const totalMissing = useMemo(() => (data?.groups || []).reduce((n, g) => n + missingIn(g), 0), [data, missingIn]);

  const editable = !!data?.session.editable;

  const invalid = useMemo(() => {
    const bad = new Set<string>();
    for (const [k, v] of Object.entries(edits)) {
      const [groupId, graderId, , comp] = k.split('|');
      const g = data?.groups.find((x) => x.id === groupId);
      const gr = g?.graders.find((x) => x.id === graderId);
      const max = g && gr ? data?.plans[g.track]?.[gr.role].find((r) => r.component === comp)?.max : undefined;
      const n = Number(v);
      if (v.trim() === '' || !Number.isFinite(n) || n < 0 || (max !== undefined && n > max)) bad.add(k);
    }
    return bad;
  }, [edits, data]);

  const setCell = (k: string, value: string, original: number | undefined) => {
    setEdits((prev) => {
      const next = { ...prev };
      if (value === (original === undefined ? '' : String(original))) delete next[k];
      else next[k] = value;
      return next;
    });
  };

  /** Enter / arrow keys move down or up the same column, like a spreadsheet. */
  const moveFocus = (el: HTMLInputElement, dir: 1 | -1) => {
    const all = Array.from(tableRef.current?.querySelectorAll<HTMLInputElement>(`input[data-col="${el.dataset.col}"]`) || []);
    const i = all.indexOf(el);
    all[i + dir]?.focus();
    all[i + dir]?.select();
  };

  const save = async () => {
    if (!data || dirty === 0) return;
    if (invalid.size > 0) {
      toast.error(`Fix ${invalid.size} mark${invalid.size === 1 ? '' : 's'} outside the allowed range (or clear the edit) first`);
      return;
    }
    // One request per group + grader + component, as the group marks route expects.
    const batches = new Map<string, { groupId: string; graderId: string; component: string; marks: { studentAccountId: string; rawScore: number }[] }>();
    for (const [k, v] of Object.entries(edits)) {
      const [groupId, graderId, studentId, comp] = k.split('|');
      const bk = `${groupId}|${graderId}|${comp}`;
      if (!batches.has(bk)) batches.set(bk, { groupId, graderId, component: comp, marks: [] });
      batches.get(bk)!.marks.push({ studentAccountId: studentId, rawScore: Number(v) });
    }
    setSaving(true);
    let saved = 0;
    const problems: string[] = [];
    const done = new Set<string>();
    for (const b of batches.values()) {
      try {
        const res = await fetch(`/api/capstone/groups/${b.groupId}/marks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ component: b.component, onBehalfOf: b.graderId, marks: b.marks }),
        });
        const body = await res.json();
        const g = data.groups.find((x) => x.id === b.groupId);
        const who = g?.graders.find((x) => x.id === b.graderId)?.name || 'grader';
        if (!res.ok) {
          problems.push(`Group ${g?.groupNumber} (${who}): ${body.error || 'not saved'}`);
          continue;
        }
        saved += body.saved || 0;
        const rejected = new Set((body.rejected || []).map((r: { studentAccountId: string }) => r.studentAccountId));
        for (const r of body.rejected || []) {
          const s = g?.students.find((x) => x.id === r.studentAccountId);
          problems.push(`${s?.name || 'A student'} (${who}): ${r.reason}`);
        }
        for (const m of b.marks) if (!rejected.has(m.studentAccountId)) done.add(cellKey(b.groupId, b.graderId, m.studentAccountId, b.component));
      } catch {
        problems.push('A request failed - check your connection');
      }
    }
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !done.has(k))));
    setSaving(false);
    if (saved) toast.success(`Saved ${saved} mark${saved === 1 ? '' : 's'}`);
    if (problems.length) toast.error(`${problems.length} not saved`, { description: problems.slice(0, 4).join(' · ') + (problems.length > 4 ? ' …' : '') });
    load();
  };

  return (
    <TeacherShell
      title="Enter marks"
      subtitle={data?.session.label}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/capstone/sessions">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sessions</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/capstone/sessions/${id}/grades`}>
              <span>Grades</span>
            </Link>
          </Button>
        </>
      }
    >
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 pb-28 sm:p-6 sm:pb-28">
        {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
        {!data && !error && (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading every group&apos;s marks…
          </div>
        )}

        {data && (
          <>
            {!editable && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p>
                  {data.session.status === 'draft'
                    ? 'This session is still being set up - marks can be entered once it is running.'
                    : 'This session is finished and its results are published, so marks are read-only. Reopen it from Sessions to correct a mark.'}
                </p>
              </div>
            )}

            {/* What to enter */}
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center">
              <div className="flex flex-wrap rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Component">
                {components.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={component === c}
                    onClick={() => setPicked(c)}
                    className={cn(
                      'rounded-md px-3 py-1.5 font-medium transition-colors',
                      component === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {LABEL[c] || c}
                  </button>
                ))}
              </div>
              {tracks.length > 1 && (
                <div className="flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Track">
                  {['all', ...tracks].map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={track === t}
                      onClick={() => setTrack(t)}
                      className={cn('rounded-md px-2.5 py-1.5 transition-colors', track === t ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {t === 'all' ? 'All tracks' : `Track ${t}`}
                    </button>
                  ))}
                </div>
              )}
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search group, student, ID or grader…" className="h-9 pl-8" />
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4 accent-primary" />
                Only groups with missing marks
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', totalMissing ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300')}>
                  {totalMissing ? `${totalMissing} missing` : 'none missing'}
                </span>
              </label>
            </div>

            <p className="text-xs text-muted-foreground">
              Type each grader&apos;s total straight in; press Enter to go down. Marks are saved as that grader&apos;s,
              noted as entered by you. Only counted graders&apos; blanks count as missing.
            </p>

            <div ref={tableRef} className="space-y-4">
              {visibleGroups.length === 0 && (
                <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                  {onlyMissing ? (
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Every counted {LABEL[component]?.toLowerCase()} mark is in.
                    </span>
                  ) : (
                    'No groups match.'
                  )}
                </p>
              )}
              {visibleGroups.map((g) => {
                const cols = columnsFor(g);
                const missing = missingIn(g);
                return (
                  <section key={g.id} className="overflow-hidden rounded-xl border bg-card">
                    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-4 py-2.5">
                      <span className="font-mono text-xs text-muted-foreground">
                        {g.track}·#{g.groupNumber}
                      </span>
                      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{g.projectTitle}</h2>
                      {missing > 0 ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">{missing} missing</span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">complete</span>
                      )}
                      <Tip label="Open the group: rubric-by-criterion entry, choose evaluators, journals">
                        <button type="button" onClick={() => setOpenGroupId(g.id)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          Open group <ExternalLink className="h-3 w-3" />
                        </button>
                      </Tip>
                    </header>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="sticky left-0 z-10 min-w-48 bg-card px-4 py-2 text-xs font-medium text-muted-foreground">Student</th>
                            {cols.map(({ grader, req }) => {
                              const counted = counts(g, grader);
                              return (
                                <th key={grader.id} className={cn('min-w-36 px-3 py-2 align-bottom', !grader.current && 'opacity-60')}>
                                  <span className="block truncate text-xs font-semibold" title={grader.name}>
                                    {grader.name}
                                  </span>
                                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] font-normal text-muted-foreground">
                                    {grader.role === 'supervisor' ? 'Supervisor' : 'Evaluator'} · /{req.max}
                                    {!grader.current ? (
                                      <span className="rounded bg-muted px-1">left group</span>
                                    ) : counted && grader.role === 'evaluator' && (component === 'presentation' || component === 'report' || component === 'poster') && g.evaluatorTopK?.[component] ? (
                                      <span className="inline-flex items-center gap-0.5 text-sky-700 dark:text-sky-300" title={`Each student's ${g.evaluatorTopK[component]} highest evaluator marks count`}>
                                        <UserCheck className="h-3 w-3" /> top {g.evaluatorTopK[component]}
                                      </span>
                                    ) : counted ? (
                                      <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-300" title="These marks count toward the grade">
                                        <UserCheck className="h-3 w-3" /> counts
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-300" title="Recorded but not counted - choose evaluators in the group's Manage tab">
                                        <UserMinus className="h-3 w-3" /> not counted
                                      </span>
                                    )}
                                  </span>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {g.students.map((s) => (
                            <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="sticky left-0 z-10 bg-card px-4 py-1.5">
                                <span className="block truncate text-sm">{s.name}</span>
                                <span className="block font-mono text-[11px] text-muted-foreground">{s.studentId}</span>
                              </td>
                              {cols.map(({ grader, req }) => {
                                const k = cellKey(g.id, grader.id, s.id, component);
                                const mark = markByKey.get(k);
                                const edited = k in edits;
                                const value = edited ? edits[k] : mark ? String(mark.score) : '';
                                const readOnly = !editable || !grader.current;
                                return (
                                  <td key={grader.id} className="px-3 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        max={req.max}
                                        step="any"
                                        value={value}
                                        placeholder="—"
                                        readOnly={readOnly}
                                        data-col={`${g.id}|${grader.id}`}
                                        aria-label={`${grader.name}'s ${LABEL[component] || component} mark for ${s.name}`}
                                        onChange={(e) => setCell(k, e.target.value, mark?.score)}
                                        onFocus={(e) => e.target.select()}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            moveFocus(e.currentTarget, 1);
                                          } else if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            moveFocus(e.currentTarget, -1);
                                          }
                                        }}
                                        className={cn(
                                          'h-8 w-20 rounded-md border bg-background px-2 text-right tabular-nums outline-none focus:ring-2 focus:ring-ring',
                                          readOnly && 'cursor-default border-transparent bg-transparent',
                                          edited && 'border-amber-500 bg-amber-500/10',
                                          invalid.has(k) && 'border-destructive bg-destructive/10',
                                          !value && !readOnly && counts(g, grader) && 'border-dashed'
                                        )}
                                      />
                                      {mark?.hasRubric && !edited && (
                                        <Tip label="Entered criterion by criterion. Typing a new total here replaces that breakdown.">
                                          <span className="h-1.5 w-1.5 rounded-full bg-primary/60" aria-label="Has rubric breakdown" />
                                        </Tip>
                                      )}
                                      {mark?.byCoordinator && !edited && (
                                        <span className="text-[10px] text-muted-foreground" title="Entered by a coordinator">
                                          sheet
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>


      <GroupModal
        groupId={openGroupId}
        onClosed={() => {
          setOpenGroupId(null);
          // Marks or chosen evaluators may have changed in there.
          load();
        }}
      />

      {/* Save bar */}
      {dirty > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
            <span className="text-sm">
              <strong>{dirty}</strong> unsaved mark{dirty === 1 ? '' : 's'}
              {invalid.size > 0 && <span className="ml-2 text-destructive">· {invalid.size} out of range</span>}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEdits({})} disabled={saving}>
                <Undo2 className="mr-1.5 h-4 w-4" /> Discard
              </Button>
              <Button size="sm" onClick={save} disabled={saving || invalid.size > 0}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save all
              </Button>
            </div>
          </div>
        </div>
      )}
    </TeacherShell>
  );
}
