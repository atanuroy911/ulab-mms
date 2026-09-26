'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CheckCircle2, ChevronLeft, GraduationCap, Loader2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SessionStatusPill } from '@/app/capstone/components/SessionStatusPill';
import {
  DECISION_LABEL,
  NEXT_TRACK,
  OUTCOME_LABEL,
  REASON_LABEL,
  groupOutcome,
  type Decision,
  type DecisionReason,
  type GroupOutcome,
} from '@/lib/capstoneProgression';

interface PlanMember {
  studentAccountId: string;
  studentId: string;
  name: string;
  score: number | null;
  letter: string | null;
  removed: boolean;
  decision: Decision;
  reason: DecisionReason;
}
interface PlanGroup {
  groupId: string;
  track: string;
  nextTrack: string | null;
  groupNumber: number;
  projectTitle: string;
  supervisorName: string | null;
  alreadyMoved: { targetSessionLabel: string; targetGroupId: string | null; movedAt: string } | null;
  members: PlanMember[];
}
interface Plan {
  session: { id: string; label: string; status: string };
  canMove: boolean;
  targets: Array<{ id: string; label: string; status: string; tracks: string[]; groupCount: number }>;
  groups: PlanGroup[];
}
interface MoveResult {
  moved: Array<{ sourceGroupId: string; targetGroupId: string; track: string; groupNumber: number; students: number }>;
  stayed: Array<{ sourceGroupId: string; students: number }>;
  skipped: Array<{ sourceGroupId: string; reason: string }>;
}

const OUTCOME_TONE: Record<GroupOutcome, string> = {
  moves: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  partial: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  stays: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  graduates: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  alreadyMoved: 'bg-muted text-muted-foreground',
};

const DECISIONS: Decision[] = ['move', 'hold', 'withdrawn'];
const DECISION_TONE: Record<Decision, string> = {
  move: 'bg-emerald-600 text-white',
  hold: 'bg-rose-600 text-white',
  withdrawn: 'bg-slate-600 text-white',
};

/**
 * Moves a graded session's groups on to the next session, in three guided steps: pick the
 * next session, review who moves (each student pre-decided with the reason, all changeable),
 * confirm. Server rules: lib/capstoneProgressionServer.ts.
 */
export function ProgressionWizard({ sessionId, open, onOpenChange, onDone }: { sessionId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Record<string, Decision>>>({});
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'groups' | 'students'>('groups');
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [notify, setNotify] = useState(false);
  const [moving, setMoving] = useState(false);
  const [result, setResult] = useState<MoveResult | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setStep(0);
    setResult(null);
    fetch(`/api/capstone/sessions/${sessionId}/progression`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || 'Failed to load');
        if (cancelled) return;
        const p = body as Plan;
        setPlan(p);
        setDecisions(Object.fromEntries(p.groups.map((g) => [g.groupId, Object.fromEntries(g.members.map((m) => [m.studentAccountId, m.decision]))])));
        setIncluded(new Set(p.groups.filter((g) => !g.alreadyMoved && g.nextTrack).map((g) => g.groupId)));
        setTargetId(p.targets.length === 1 ? p.targets[0].id : null);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  const target = plan?.targets.find((t) => t.id === targetId) || null;
  const outcomeOf = (g: PlanGroup) =>
    groupOutcome(g.track, g.members.map((m) => decisions[g.groupId]?.[m.studentAccountId] ?? m.decision), !!g.alreadyMoved);
  const missingTracks = useMemo(() => {
    if (!plan || !target) return [];
    const needed = new Set(plan.groups.filter((g) => !g.alreadyMoved && g.nextTrack).map((g) => g.nextTrack!));
    return [...needed].filter((t) => !target.tracks.includes(t));
  }, [plan, target]);

  const summary = useMemo(() => {
    const s = { groupsMove: 0, studentsMove: 0, held: 0, withdrawn: 0, groupsStay: 0, graduates: 0, already: 0 };
    for (const g of plan?.groups || []) {
      const o = outcomeOf(g);
      if (o === 'alreadyMoved') {
        s.already++;
        continue;
      }
      if (o === 'graduates') {
        s.graduates++;
        continue;
      }
      if (!included.has(g.groupId)) continue;
      for (const m of g.members) {
        const d = decisions[g.groupId]?.[m.studentAccountId] ?? m.decision;
        if (d === 'move') s.studentsMove++;
        else if (d === 'withdrawn') s.withdrawn++;
        else s.held++;
      }
      if (o === 'stays') s.groupsStay++;
      else s.groupsMove++;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, decisions, included]);

  const setDecision = (groupId: string, studentId: string, d: Decision) =>
    setDecisions((prev) => ({ ...prev, [groupId]: { ...prev[groupId], [studentId]: d } }));

  const move = async () => {
    if (!plan || !target) return;
    setMoving(true);
    try {
      const res = await fetch(`/api/capstone/sessions/${sessionId}/progression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSessionId: target.id, groupIds: [...included], decisions, notify }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Move failed');
      setResult(body);
      setStep(3);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setMoving(false);
    }
  };

  const groupsById = new Map((plan?.groups || []).map((g) => [g.groupId, g]));
  const actionable = (plan?.groups || []).filter((g) => !g.alreadyMoved && g.nextTrack);
  const visibleGroups = (plan?.groups || []).filter((g) => !onlyAttention || ['partial', 'stays'].includes(outcomeOf(g)));
  const steps = ['Choose next session', 'Review who moves', 'Confirm'];

  return (
    <Dialog open={open} onOpenChange={(o) => !moving && onOpenChange(o)}>
      <DialogContent showCloseButton={false} className="flex h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:h-[94dvh] sm:w-[min(1200px,96vw)] sm:rounded-xl sm:border">
        {/* Header + stepper */}
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg">Move groups to the next session</DialogTitle>
            <DialogDescription className="text-xs">{plan ? `From ${plan.session.label}` : 'Loading…'}</DialogDescription>
          </div>
          <ol className="hidden items-center gap-2 text-xs md:flex">
            {steps.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full font-bold',
                    step > i || step === 3 ? 'bg-emerald-600 text-white' : step === i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {step > i || step === 3 ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={step === i ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
                {i < steps.length - 1 && <span className="h-px w-6 bg-border" />}
              </li>
            ))}
          </ol>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} disabled={moving} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {loading || !plan ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : step === 0 ? (
            /* ── Step 1: next session ── */
            <div className="mx-auto max-w-3xl space-y-6">
              {!plan.canMove && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  Groups can be moved on once this session is in <strong>Grading</strong> or <strong>Finished</strong>. It is currently{' '}
                  <SessionStatusPill status={plan.session.status} />.
                </p>
              )}
              <div>
                <h3 className="text-lg font-semibold">Which session do the groups continue in?</h3>
                <p className="text-sm text-muted-foreground">Usually next semester&apos;s session. It has to be set up or running.</p>
              </div>
              {plan.targets.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <p className="font-medium">There&apos;s no next session to move into yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Open next semester&apos;s capstone session first, then come back here.</p>
                  <Button asChild className="mt-4">
                    <Link href="/capstone/sessions">Go to sessions</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {plan.targets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTargetId(t.id)}
                      className={cn('rounded-xl border p-4 text-left transition-colors', targetId === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{t.label}</span>
                        <SessionStatusPill status={t.status} />
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        Tracks {t.tracks.join(', ')} · {t.groupCount} group{t.groupCount === 1 ? '' : 's'} already
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-xl border p-4">
                <p className="mb-2 text-sm font-medium">What happens to each track</p>
                <ul className="space-y-1.5 text-sm">
                  {(['A', 'B', 'C'] as const).map((t) => {
                    const count = actionable.filter((g) => g.track === t).length + (t === 'C' ? plan.groups.filter((g) => g.track === 'C').length : 0);
                    if (!count) return null;
                    const next = NEXT_TRACK[t];
                    const missing = next && target && !target.tracks.includes(next);
                    return (
                      <li key={t} className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">Track {t}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        {next ? (
                          <span className={missing ? 'text-destructive' : ''}>
                            Track {next}
                            {missing ? ' - the chosen session doesn’t run it' : ''}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-sky-700 dark:text-sky-300">
                            <GraduationCap className="h-4 w-4" /> completes the capstone (nothing to move)
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">· {count} group{count === 1 ? '' : 's'}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : step === 1 ? (
            /* ── Step 2: review ── */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  ['Groups moving', summary.groupsMove, 'text-emerald-600'],
                  ['Students moving', summary.studentsMove, 'text-emerald-600'],
                  ['Held back', summary.held, 'text-rose-600'],
                  ['Withdrawn (not copied)', summary.withdrawn, 'text-slate-500'],
                  ['Groups staying', summary.groupsStay, 'text-rose-600'],
                  ['Already moved', summary.already, 'text-muted-foreground'],
                ].map(([label, n, tone]) => (
                  <div key={label as string} className="rounded-lg border px-3 py-2">
                    <p className={cn('text-2xl font-bold tabular-nums', tone as string)}>{n as number}</p>
                    <p className="text-xs text-muted-foreground">{label as string}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border p-0.5 text-sm" role="tablist">
                  {(['groups', 'students'] as const).map((v) => (
                    <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('rounded-md px-3 py-1', view === v ? 'bg-muted font-medium' : 'text-muted-foreground')}>
                      {v === 'groups' ? 'By group' : 'By student'}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={onlyAttention} onCheckedChange={(v) => setOnlyAttention(!!v)} /> Only groups where someone stays behind
                </label>
                <p className="ml-auto text-xs text-muted-foreground">Decisions are pre-filled from grades - change any of them.</p>
              </div>

              {view === 'groups' ? (
                <div className="space-y-3">
                  {visibleGroups.map((g) => {
                    const o = outcomeOf(g);
                    const locked = o === 'alreadyMoved' || o === 'graduates';
                    return (
                      <section key={g.groupId} className={cn('rounded-xl border', locked && 'opacity-70')}>
                        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                          {!locked && (
                            <Checkbox
                              checked={included.has(g.groupId)}
                              onCheckedChange={(v) =>
                                setIncluded((prev) => {
                                  const next = new Set(prev);
                                  if (v) next.add(g.groupId);
                                  else next.delete(g.groupId);
                                  return next;
                                })
                              }
                              aria-label="Include this group"
                            />
                          )}
                          <span className="font-mono text-xs text-muted-foreground">
                            {g.track} #{g.groupNumber}
                            {g.nextTrack && !locked ? ` → ${g.nextTrack}` : ''}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">{g.projectTitle}</span>
                          <span className="text-xs text-muted-foreground">{g.supervisorName}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', OUTCOME_TONE[o])}>
                            {o === 'alreadyMoved' ? `Moved to ${g.alreadyMoved!.targetSessionLabel}` : OUTCOME_LABEL[o]}
                          </span>
                        </header>
                        <ul className="divide-y">
                          {g.members.map((m) => (
                            <MemberRow
                              key={m.studentAccountId}
                              m={m}
                              decision={decisions[g.groupId]?.[m.studentAccountId] ?? m.decision}
                              locked={locked || m.removed || !included.has(g.groupId)}
                              onChange={(d) => setDecision(g.groupId, m.studentAccountId, d)}
                            />
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2">Group</th>
                        <th className="px-3 py-2 text-center">Total</th>
                        <th className="px-3 py-2 text-center">Grade</th>
                        <th className="px-3 py-2">Why</th>
                        <th className="px-3 py-2">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleGroups.flatMap((g) => {
                        const o = outcomeOf(g);
                        const locked = o === 'alreadyMoved' || o === 'graduates' || !included.has(g.groupId);
                        return g.members.map((m) => (
                          <tr key={`${g.groupId}:${m.studentAccountId}`} className={locked ? 'opacity-70' : ''}>
                            <td className="px-3 py-2">
                              <p className="font-medium">{m.name || m.studentId}</p>
                              <p className="font-mono text-xs text-muted-foreground">{m.studentId}</p>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {g.track} #{g.groupNumber} · <span className="text-muted-foreground">{g.projectTitle}</span>
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums">{m.score === null ? '—' : m.score.toFixed(2)}</td>
                            <td className="px-3 py-2 text-center font-bold">{m.letter || '—'}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{REASON_LABEL[m.reason]}</td>
                            <td className="px-3 py-2">
                              <DecisionPicker
                                value={decisions[g.groupId]?.[m.studentAccountId] ?? m.decision}
                                locked={locked || m.removed}
                                onChange={(d) => setDecision(g.groupId, m.studentAccountId, d)}
                              />
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : step === 2 ? (
            /* ── Step 3: confirm ── */
            <div className="mx-auto max-w-2xl space-y-5">
              <h3 className="text-lg font-semibold">Ready to move</h3>
              <div className="rounded-xl border p-5">
                <p className="text-2xl font-bold">
                  {summary.groupsMove} group{summary.groupsMove === 1 ? '' : 's'} · {summary.studentsMove} student{summary.studentsMove === 1 ? '' : 's'}
                </p>
                <p className="text-muted-foreground">move to {target?.label}</p>
                <ul className="mt-4 space-y-1 text-sm">
                  <li>
                    <strong>{summary.held}</strong> held back and <strong>{summary.withdrawn}</strong> withdrawn - they are not copied to {target?.label}, and stay as they are in {plan.session.label} (their group, marks and grade are unchanged).
                  </li>
                  {summary.groupsStay > 0 && (
                    <li>
                      <strong>{summary.groupsStay}</strong> group{summary.groupsStay === 1 ? '' : 's'} stay entirely - recorded, nothing created.
                    </li>
                  )}
                  <li>Each new group keeps its title and supervisor. Evaluators are assigned fresh in the new session.</li>
                  <li>Grades in {plan.session.label} don’t change.</li>
                </ul>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} className="mt-0.5" />
                Email moving students their new group and how the weekly journal works
              </label>
            </div>
          ) : (
            /* ── Done ── */
            result && (
              <div className="mx-auto max-w-2xl space-y-5">
                <p className="flex items-center gap-2 text-xl font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" /> Done
                </p>
                <p>
                  {result.moved.length} group{result.moved.length === 1 ? '' : 's'} ({result.moved.reduce((n, m) => n + m.students, 0)} students) moved to {target?.label}
                  {result.stayed.length ? `; ${result.stayed.length} stayed` : ''}.
                </p>
                {result.moved.length > 0 && (
                  <ul className="divide-y rounded-xl border text-sm">
                    {result.moved.map((m) => (
                      <li key={m.targetGroupId} className="flex items-center gap-2 px-3 py-2">
                        <span className="flex-1 truncate">{groupsById.get(m.sourceGroupId)?.projectTitle}</span>
                        <span className="font-mono text-xs">
                          → {m.track} #{m.groupNumber}
                        </span>
                        <Link href={`/capstone/groups/${m.targetGroupId}`} className="text-primary hover:underline">
                          Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {result.skipped.length > 0 && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <p className="mb-1 font-medium">Not moved</p>
                    <ul className="space-y-0.5">
                      {result.skipped.map((s) => (
                        <li key={s.sourceGroupId}>
                          {groupsById.get(s.sourceGroupId)?.projectTitle}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Footer: the one obvious next action */}
        <div className="flex items-center gap-2 border-t px-4 py-3 sm:px-6">
          {step > 0 && step < 3 && (
            <Button variant="outline" size="lg" onClick={() => setStep(step - 1)} disabled={moving}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {step === 0 && missingTracks.length > 0 && (
              <span className="text-xs text-destructive">The chosen session doesn&apos;t run Track {missingTracks.join(', ')}.</span>
            )}
            {step === 0 && (
              <Button size="lg" onClick={() => setStep(1)} disabled={!plan?.canMove || !target || actionable.length === 0}>
                Review who moves <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {step === 1 && (
              <Button size="lg" onClick={() => setStep(2)} disabled={included.size === 0}>
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {step === 2 && (
              <Button size="lg" onClick={move} disabled={moving || included.size === 0}>
                {moving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                Move {summary.groupsMove} group{summary.groupsMove === 1 ? '' : 's'}
              </Button>
            )}
            {step === 3 && (
              <Button size="lg" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DecisionPicker({ value, locked, onChange }: { value: Decision; locked: boolean; onChange: (d: Decision) => void }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5" role="radiogroup">
      {DECISIONS.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          disabled={locked}
          onClick={() => onChange(d)}
          className={cn('rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed', value === d ? DECISION_TONE[d] : 'text-muted-foreground hover:bg-muted')}
        >
          {DECISION_LABEL[d]}
        </button>
      ))}
    </div>
  );
}

function MemberRow({ m, decision, locked, onChange }: { m: PlanMember; decision: Decision; locked: boolean; onChange: (d: Decision) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="min-w-40 flex-1">
        <span className="block text-sm font-medium">{m.name || m.studentId}</span>
        <span className="font-mono text-xs text-muted-foreground">{m.studentId}</span>
      </span>
      <span className="w-24 text-center">
        <span className="block text-sm font-bold">{m.letter || '—'}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{m.score === null ? 'no total' : m.score.toFixed(2)}</span>
      </span>
      <span className="w-36 text-xs text-muted-foreground">{REASON_LABEL[m.reason]}</span>
      <DecisionPicker value={decision} locked={locked} onChange={onChange} />
    </li>
  );
}
