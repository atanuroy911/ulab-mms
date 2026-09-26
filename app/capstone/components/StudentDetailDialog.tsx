'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, Pencil, Save, X, CheckCircle2, Circle, MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import { Tip } from '@/app/components/Tip';

/**
 * One student in one capstone group: details (editable by coordinators), final grade and how
 * it was built under the pinned scheme, every submitted mark, and weekly-journal progress.
 *
 * Opened by clicking a student's name anywhere in capstone (coordinator group list, group
 * page, My Groups). What a supervisor/evaluator sees is decided server-side - another
 * grader's marks only after they've submitted their own (lib/capstoneGrades.ts).
 */

const COMPONENT_LABEL: Record<string, string> = {
  report: 'Report',
  presentation: 'Presentation',
  peer: 'Peer mark',
  weeklyJournal: 'Weekly journal',
  poster: 'Poster',
};

interface Submission {
  component: string;
  submitterId: string;
  submitterName: string;
  /** Set when a coordinator entered this grader's paper sheet for them. */
  enteredByName?: string | null;
  submitterRole: 'supervisor' | 'evaluator';
  counted: boolean;
  rawScore: number;
  rubricMax: number | null;
}

interface Detail {
  student: { studentAccountId: string; studentId: string; name: string; email: string; removedAt: string | null };
  group: { _id: string; track: string; groupNumber: number; projectTitle: string };
  session: { department: string; status: string; semesterName?: string; journalWeekCount: number };
  scheme: { name: string | null; version: number | null; status?: string } | null;
  grade: {
    score: number | null;
    letter: string | null;
    trace: Array<{ nodeId: string; type: string; label: string; value: number }>;
    missingComponents: string[];
    submissions: Submission[];
    gradeHiddenUntil?: string[];
    error?: string;
  } | null;
  journal: Array<{ weekNumber: number; submitted: boolean; reviewed: boolean }>;
  viewer: { canManage: boolean; role: 'coordinator' | 'supervisor' | 'evaluator' };
}

interface Props {
  /** Off on the group's own page, where the journal is already the main tab. */
  showJournalLink?: boolean;
  groupId: string | null;
  studentAccountId: string | null;
  onClose: () => void;
  /** Called after a coordinator edits the student's name/email, so lists can refresh. */
  onUpdated?: (student: { studentAccountId: string; name: string; email: string }) => void;
}

const round = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n);

export function StudentDetailDialog({ groupId, studentAccountId, onClose, onUpdated, showJournalLink = true }: Props) {
  const open = !!groupId && !!studentAccountId;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(false);
  // Loading until the fetched detail is for the student currently asked for - derived rather
  // than toggled, so switching students never flashes the previous one's data.
  const loading = open && (!detail || detail.student.studentAccountId !== studentAccountId || detail.group._id !== groupId);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/capstone/groups/${groupId}/students/${studentAccountId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load student');
        if (cancelled) return;
        setDetail(data);
        setEditing(false);
        setName(data.student.name);
        setEmail(data.student.email);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load student');
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, studentAccountId]);

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/capstone/groups/${groupId}/students/${studentAccountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      const updated = { ...detail.student, name: data.student.name, email: data.student.email || '' };
      setDetail({ ...detail, student: updated });
      setEditing(false);
      toast.success('Student details saved');
      onUpdated?.({ studentAccountId: updated.studentAccountId, name: updated.name, email: updated.email });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Marks grouped by component, in a stable order.
  const byComponent = new Map<string, Submission[]>();
  for (const s of detail?.grade?.submissions || []) {
    if (!byComponent.has(s.component)) byComponent.set(s.component, []);
    byComponent.get(s.component)!.push(s);
  }
  const componentOrder = ['report', 'presentation', 'peer', 'weeklyJournal', 'poster'].filter((c) => byComponent.has(c));

  const weeks = detail ? Array.from({ length: detail.session.journalWeekCount }, (_, i) => i + 1) : [];
  const journalByWeek = new Map((detail?.journal || []).map((j) => [j.weekNumber, j]));
  const submittedWeeks = (detail?.journal || []).filter((j) => j.submitted).length;

  return (
    // A right-hand drawer rather than a centred modal, so the group page stays visible beside it.
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-4 overflow-y-auto p-5 sm:max-w-xl">
        {loading || !detail ? (
          <>
            <SheetHeader className="p-0 pr-8">
              <SheetTitle>Student</SheetTitle>
              <SheetDescription>Loading…</SheetDescription>
            </SheetHeader>
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="p-0 pr-8">
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {detail.student.name || detail.student.studentId}
                {detail.student.removedAt && <Badge variant="outline">Removed from group</Badge>}
              </SheetTitle>
              <SheetDescription>
                {detail.student.studentId} · Track {detail.group.track} #{detail.group.groupNumber} ·{' '}
                {detail.group.projectTitle}
              </SheetDescription>
            </SheetHeader>

            {/* Details */}
            <section className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Details</h3>
                {detail.viewer.canManage && !editing && (
                  <Tip label="Correct this student's name or email. The student ID can't be changed - remove and re-add them instead.">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(true)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                    </Button>
                  </Tip>
                )}
              </div>
              {editing ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="sd-name" className="text-xs">Name</Label>
                      <Input id="sd-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sd-email" className="text-xs">Email</Label>
                      <Input id="sd-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(detail.student.name); setEmail(detail.student.email); }} disabled={saving}>
                      <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
                      {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[6rem_1fr]">
                  <dt className="text-muted-foreground">Student ID</dt>
                  <dd className="font-mono">{detail.student.studentId}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{detail.student.email || <span className="text-muted-foreground">Not on record - they can&apos;t be emailed</span>}</dd>
                </dl>
              )}
            </section>

            {/* Grade */}
            <section className="rounded-lg border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Grade</h3>
                {detail.scheme?.name && (
                  <span className="text-xs text-muted-foreground">
                    {detail.scheme.name}
                    {detail.scheme.version ? ` · v${detail.scheme.version}` : ''}
                  </span>
                )}
              </div>
              {!detail.scheme?.name ? (
                <p className="text-sm text-muted-foreground">
                  No grading scheme is pinned to Track {detail.group.track} yet, so no grade can be computed.
                </p>
              ) : detail.grade?.gradeHiddenUntil?.length ? (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    The grade and other graders&apos; marks appear once you&apos;ve submitted your own{' '}
                    {detail.grade.gradeHiddenUntil.map((c) => COMPONENT_LABEL[c] || c).join(', ')} mark
                    {detail.grade.gradeHiddenUntil.length === 1 ? '' : 's'}.
                  </span>
                </p>
              ) : detail.grade?.error ? (
                <p className="text-sm text-destructive">Could not compute: {detail.grade.error}</p>
              ) : (
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <div className="text-3xl font-bold tabular-nums">
                      {detail.grade?.score != null ? round(detail.grade.score) : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  {detail.grade?.letter && (
                    <div>
                      <div className="text-3xl font-bold">{detail.grade.letter}</div>
                      <div className="text-xs text-muted-foreground">Letter grade</div>
                    </div>
                  )}
                  {!!detail.grade?.missingComponents?.length && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Still waiting on: {detail.grade.missingComponents.map((c) => COMPONENT_LABEL[c] || c).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Every submitted mark, per component - the plain numbers behind the grade. */}
              {componentOrder.length > 0 && (
                <div className="mt-3 space-y-2">
                  {componentOrder.map((component) => (
                    <div key={component} className="rounded-md bg-muted/40 p-2">
                      <p className="mb-1 text-xs font-medium">{COMPONENT_LABEL[component] || component}</p>
                      <ul className="space-y-0.5 text-xs">
                        {byComponent.get(component)!.map((s, i) => (
                          <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {s.submitterName}{' '}
                              <span className="text-muted-foreground">({s.submitterRole})</span>
                              {s.enteredByName && (
                                <span className="text-muted-foreground"> · entered by {s.enteredByName}</span>
                              )}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-mono tabular-nums">
                                {round(s.rawScore)}
                                {s.rubricMax ? ` / ${s.rubricMax}` : ''}
                              </span>
                              {!s.counted && (
                                <Tip label="This evaluator isn't one of the ones chosen to count for this component, so the mark is recorded but not used.">
                                  <Badge variant="outline" className="text-[10px]">not counted</Badge>
                                </Tip>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {!!detail.grade?.trace?.length && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    How this grade was computed
                  </summary>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {detail.grade.trace
                      .filter((t) => t.type !== 'constant')
                      .map((t) => (
                        <li key={t.nodeId} className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{t.label}</span>
                          <span className="font-mono tabular-nums">{round(t.value)}</span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </section>

            {/* Journal */}
            <section className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Weekly journal</h3>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  {submittedWeeks} of {detail.session.journalWeekCount} weeks submitted
                  {showJournalLink && (
                    <a href={`/capstone/groups/${groupId}?student=${studentAccountId}`} className="font-medium text-primary hover:underline">
                      Open weekly journal →
                    </a>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {weeks.map((w) => {
                  const entry = journalByWeek.get(w);
                  const state = entry?.reviewed ? (entry.submitted ? 'reviewed' : 'closed') : entry?.submitted ? 'submitted' : 'missing';
                  return (
                    <Tip
                      key={w}
                      label={
                        state === 'reviewed'
                          ? `Week ${w}: submitted and reviewed`
                          : state === 'submitted'
                            ? `Week ${w}: submitted, waiting for the supervisor's review`
                            : state === 'closed'
                              ? `Week ${w}: closed by the supervisor as not submitted`
                              : `Week ${w}: not submitted`
                      }
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium ${
                          state === 'reviewed'
                            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : state === 'submitted'
                              ? 'border-primary/50 bg-primary/10 text-primary'
                              : state === 'closed'
                                ? 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                : 'text-muted-foreground'
                        }`}
                      >
                        {w}
                      </span>
                    </Tip>
                  );
                })}
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> reviewed</span>
                <span className="flex items-center gap-1"><MessageSquareText className="h-3 w-3 text-primary" /> submitted</span>
                <span className="flex items-center gap-1"><Circle className="h-3 w-3" /> not submitted</span>
              </p>
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
