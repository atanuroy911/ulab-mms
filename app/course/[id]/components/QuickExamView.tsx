'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, BarChart3, ClipboardCopy, Clock, Lock, MoreVertical, Pencil, Plus, RefreshCw, RotateCcw, Square, Trash2, Unlock, Zap, Loader2, Users, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MathMarkdown } from '@/components/MathMarkdown';
import { cn } from '@/lib/utils';
import { QuickExamBuilder, type CourseExamOption } from './QuickExamBuilder';

interface Summary {
  _id: string;
  title: string;
  status: 'draft' | 'published' | 'closed';
  availability: 'draft' | 'upcoming' | 'open' | 'closed';
  sets: number;
  questions: number;
  durationMinutes: number;
  opensAt: string | null;
  closesAt: string | null;
  marksColumn: string | null;
  started: number;
  submitted: number;
}

const AVAIL: Record<Summary['availability'], { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground' },
  upcoming: { label: 'Scheduled', tone: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  open: { label: 'Open now', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  closed: { label: 'Closed', tone: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
};

/** The course's "Quick Exam" section: list, builder and results. */
export function QuickExamView({ courseId, exams, onMarksChanged }: { courseId: string; exams: CourseExamOption[]; onMarksChanged: () => void }) {
  const [list, setList] = useState<Summary[] | null>(null);
  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'build'; id: string | null } | { kind: 'results'; id: string }>({ kind: 'list' });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/${courseId}/quick-exams`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setList(d.exams);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load quick exams');
      setList([]);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (id: string, act: 'close' | 'reopen' | 'unpublish' | 'delete') => {
    if (act === 'delete' && !confirm('Delete this quick exam and every student’s paper? Marks already written to the course stay.')) return;
    if (act === 'close' && !confirm('Close it now? Students still writing will be marked with what they have saved.')) return;
    const res =
      act === 'delete'
        ? await fetch(`/api/courses/${courseId}/quick-exams/${id}`, { method: 'DELETE' })
        : await fetch(`/api/courses/${courseId}/quick-exams/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: act }) });
    const d = await res.json();
    if (!res.ok) return toast.error(d.error || 'Failed');
    toast.success({ close: 'Closed', reopen: 'Reopened', unpublish: 'Back to draft', delete: 'Deleted' }[act]);
    load();
  };

  const copyLink = async (id: string) => {
    const url = `${window.location.origin}/student/dashboard/quick-exams/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied - students sign in with their ULAB account and start');
    } catch {
      toast.message(url);
    }
  };

  if (mode.kind === 'build') {
    return (
      <QuickExamBuilder
        courseId={courseId}
        examId={mode.id}
        exams={exams}
        onClose={() => {
          setMode({ kind: 'list' });
          load();
        }}
        onSaved={(id) => {
          if (!mode.id) setMode({ kind: 'build', id });
          onMarksChanged();
        }}
      />
    );
  }
  if (mode.kind === 'results') {
    return <QuickExamResults courseId={courseId} id={mode.id} onBack={() => (setMode({ kind: 'list' }), load())} onMarksChanged={onMarksChanged} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Zap className="h-5 w-5 text-primary" /> Quick Exam <Badge variant="secondary">Beta</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">Paste MCQs with their answer key; students take them signed in and are marked instantly.</p>
        </div>
        <Button className="ml-auto" onClick={() => setMode({ kind: 'build', id: null })}>
          <Plus className="mr-1.5 h-4 w-4" /> New quick exam
        </Button>
      </div>

      {list === null ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="space-y-4 py-12 text-center">
            <Zap className="mx-auto h-10 w-10 text-primary/60" />
            <div>
              <p className="font-semibold">No quick exams yet</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                1. Paste questions (write them yourself or with the ready ChatGPT prompt) · 2. Check the preview · 3. Publish. Students are marked the moment they submit.
              </p>
            </div>
            <Button onClick={() => setMode({ kind: 'build', id: null })}>
              <Plus className="mr-1.5 h-4 w-4" /> Create the first one
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((qe) => (
            <div key={qe._id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 sm:p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="truncate text-left font-semibold hover:underline" onClick={() => setMode(qe.status === 'draft' ? { kind: 'build', id: qe._id } : { kind: 'results', id: qe._id })}>
                    {qe.title}
                  </button>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', AVAIL[qe.availability].tone)}>{AVAIL[qe.availability].label}</span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {qe.questions} Qs{qe.sets > 1 ? ` · ${qe.sets} sets` : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {qe.durationMinutes} min
                  </span>
                  {qe.marksColumn && <span>→ {qe.marksColumn}</span>}
                  {qe.opensAt && <span>opens {new Date(qe.opensAt).toLocaleString()}</span>}
                  {qe.closesAt && <span>closes {new Date(qe.closesAt).toLocaleString()}</span>}
                </p>
              </div>
              {qe.status !== 'draft' && (
                <button type="button" onClick={() => setMode({ kind: 'results', id: qe._id })} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                  <Users className="h-4 w-4" /> {qe.submitted}/{qe.started} submitted
                </button>
              )}
              <div className="flex items-center gap-1">
                {qe.status === 'draft' ? (
                  <Button size="sm" onClick={() => setMode({ kind: 'build', id: qe._id })}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Continue
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => copyLink(qe._id)} title="Copy the link students open">
                    <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" /> Link
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setMode({ kind: 'build', id: qe._id })}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    {qe.status !== 'draft' && (
                      <DropdownMenuItem onClick={() => setMode({ kind: 'results', id: qe._id })}>
                        <BarChart3 className="mr-2 h-4 w-4" /> Results
                      </DropdownMenuItem>
                    )}
                    {qe.status === 'published' && (
                      <DropdownMenuItem onClick={() => action(qe._id, 'close')}>
                        <Square className="mr-2 h-4 w-4" /> Close now
                      </DropdownMenuItem>
                    )}
                    {qe.status === 'closed' && (
                      <DropdownMenuItem onClick={() => action(qe._id, 'reopen')}>
                        <Unlock className="mr-2 h-4 w-4" /> Reopen
                      </DropdownMenuItem>
                    )}
                    {qe.status === 'published' && qe.started === 0 && (
                      <DropdownMenuItem onClick={() => action(qe._id, 'unpublish')}>
                        <Lock className="mr-2 h-4 w-4" /> Back to draft
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => action(qe._id, 'delete')}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Results ─────────────────────────────────────────────────────────────────────────────────

interface Row {
  studentRecordId: string;
  studentId: string;
  name: string;
  withdrawn: boolean;
  state: 'not started' | 'in progress' | 'time up' | 'submitted';
  set: string | null;
  answered: number;
  correct: number | null;
  mark: number | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
  violations: number;
}
interface Results {
  questions: number;
  marksColumn: { name: string; total: number } | null;
  rows: Row[];
  items: Array<{ set: string; questions: Array<{ number: number; stem: string; seen: number; answered: number; right: number }> }>;
}

const STATE_TONE: Record<Row['state'], string> = {
  'not started': 'text-muted-foreground',
  'in progress': 'text-sky-700 dark:text-sky-300',
  'time up': 'text-amber-700 dark:text-amber-300',
  submitted: 'text-emerald-700 dark:text-emerald-300',
};

function QuickExamResults({ courseId, id, onBack, onMarksChanged }: { courseId: string; id: string; onBack: () => void; onMarksChanged: () => void }) {
  const [data, setData] = useState<Results | null>(null);
  const [showItems, setShowItems] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/courses/${courseId}/quick-exams/${id}/results`);
    const d = await res.json();
    if (!res.ok) return toast.error(d.error || 'Failed to load results');
    setData(d);
  }, [courseId, id]);

  useEffect(() => {
    load();
    // Keep it live while students are writing.
    const t = window.setInterval(load, 20_000);
    return () => window.clearInterval(t);
  }, [load]);

  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/quick-exams/${id}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(done);
      await load();
      onMarksChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  const submitted = data.rows.filter((r) => r.state === 'submitted');
  const avg = submitted.length ? submitted.reduce((n, r) => n + (r.correct ?? 0), 0) / submitted.length : null;
  const counts = { 'not started': 0, 'in progress': 0, 'time up': 0, submitted: 0 } as Record<Row['state'], number>;
  for (const r of data.rows) if (!r.withdrawn) counts[r.state]++;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Quick exams
        </Button>
        <h2 className="text-lg font-semibold">Results</h2>
        {data.marksColumn && <span className="text-sm text-muted-foreground">→ {data.marksColumn.name} (out of {data.marksColumn.total})</span>}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowItems(!showItems)}>
            <BarChart3 className="mr-1.5 h-4 w-4" /> {showItems ? 'Hide' : 'Question'} analysis
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => post({ action: 'resync' }, 'Marks written again')} title="Write every submitted score into the marks column again (e.g. after changing its total)">
            <RefreshCw className="mr-1.5 h-4 w-4" /> Re-sync marks
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(
          [
            ['Submitted', counts.submitted, 'text-emerald-600'],
            ['Writing now', counts['in progress'], 'text-sky-600'],
            ['Not started', counts['not started'], 'text-muted-foreground'],
            ['Average', avg === null ? '-' : `${avg.toFixed(1)} / ${data.questions}`, ''],
            ['Left full screen', data.rows.filter((r) => r.violations > 0).length, 'text-amber-600'],
          ] as const
        ).map(([label, n, tone]) => (
          <div key={label} className="rounded-lg border px-3 py-2">
            <p className={cn('text-xl font-bold tabular-nums', tone)}>{n}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {showItems && (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">How many of the students who got each question answered it right. Low bars can point at a hard - or wrongly keyed - question.</p>
          {data.items.map((s) => (
            <div key={s.set} className="space-y-2">
              {data.items.length > 1 && <h4 className="text-sm font-semibold">Set {s.set}</h4>}
              {s.questions.map((q) => {
                const pct = q.seen ? Math.round((q.right / q.seen) * 100) : null;
                return (
                  <div key={q.number} className="grid grid-cols-[2rem_1fr_9rem] items-center gap-3 text-sm">
                    <span className="font-mono text-muted-foreground">{q.number}.</span>
                    <MathMarkdown className="line-clamp-2 text-sm">{q.stem}</MathMarkdown>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full', pct === null ? '' : pct < 40 ? 'bg-rose-500' : pct < 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct ?? 0}%` }} />
                      </div>
                      <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{pct === null ? 'no data' : `${q.right}/${q.seen}`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Set</TableHead>
              <TableHead className="text-right">Answered</TableHead>
              <TableHead className="text-right">Correct</TableHead>
              <TableHead className="text-right">Mark</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.studentRecordId} className={cn(r.withdrawn && 'opacity-50')}>
                <TableCell>
                  <span className="block font-medium">{r.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.studentId}</span>
                </TableCell>
                <TableCell>
                  <span className={cn('text-sm capitalize', STATE_TONE[r.state])}>
                    {r.withdrawn ? 'withdrawn' : r.state}
                    {r.state === 'submitted' && r.autoSubmitted && ' (time up)'}
                  </span>
                  {r.violations > 0 && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300" title="Each time, their answers were cleared and they were signed out">
                      <AlertTriangle className="h-3 w-3" /> left full screen ×{r.violations}
                    </span>
                  )}
                </TableCell>
                <TableCell>{r.set ?? '-'}</TableCell>
                <TableCell className="text-right tabular-nums">{r.state === 'not started' ? '-' : `${r.answered}/${data.questions}`}</TableCell>
                <TableCell className="text-right tabular-nums">{r.correct === null ? '-' : `${r.correct}/${data.questions}`}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {r.mark === null ? '-' : r.mark}
                  {r.state === 'submitted' && <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-emerald-600" aria-label="Written to marks" />}
                </TableCell>
                <TableCell className="text-right">
                  {r.state !== 'not started' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${r.name}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {r.state !== 'submitted' && (
                          <DropdownMenuItem onClick={() => post({ action: 'submit', studentRecordId: r.studentRecordId }, 'Marked')}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Mark now
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => confirm(`Let ${r.name} take it again? Their paper is discarded; the current mark stays until they submit again.`) && post({ action: 'reset', studentRecordId: r.studentRecordId }, 'Reset - they can start again')}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" /> Allow a retake
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
