'use client';

import { use as usePromise, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { StudentShell } from '../../../components/StudentShell';
import { signOut } from 'next-auth/react';
import { useStudentMe } from '../../../components/useStudentMe';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  CloudOff,
  CloudUpload,
  Flag,
  Keyboard,
  ListChecks,
  Loader2,
  Maximize,
  Save,
  ShieldAlert,
  Shuffle,
  Timer,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MathMarkdown } from '@/components/MathMarkdown';
import { cn } from '@/lib/utils';
import { optionLetter } from '@/lib/quickExam/format';

interface ExamInfo {
  title: string;
  instructions: string;
  course: string;
  questions: number;
  durationMinutes: number;
  requireFullscreen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  availability: 'upcoming' | 'open' | 'closed';
}
interface Paper {
  title: string;
  instructions: string;
  questions: Array<{ stem: string; options: string[] }>;
  answers: Array<number | null>;
  startedAt: string;
  deadline: string;
  serverNow: string;
  submitted: boolean;
  autoSubmitted: boolean;
  violations: number;
  result: { correct: number | null; total: number } | null;
  review: Array<{ right: boolean | null; correctOption: number }> | null;
}

// ── Full screen, across browsers ───────────────────────────────────────────────────────────
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const fsDoc = () => document as FsDoc;
const isFullscreen = () => !!(fsDoc().fullscreenElement || fsDoc().webkitFullscreenElement);
const fullscreenSupported = () => typeof document !== 'undefined' && !!(fsDoc().fullscreenEnabled || fsDoc().webkitFullscreenEnabled);
async function enterFullscreen() {
  const el = document.documentElement as FsEl;
  if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
  else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
}
async function exitFullscreen() {
  if (!isFullscreen()) return;
  if (document.exitFullscreen) await document.exitFullscreen().catch(() => undefined);
  else await fsDoc().webkitExitFullscreen?.().catch(() => undefined);
}

const violatedKey = (qid: string) => `quick-exam-left:${qid}`;

export default function TakeQuickExamPage({ params }: { params: Promise<{ qid: string }> }) {
  const { qid } = usePromise(params);
  // An admin acting as the student: leaving full screen still clears the answers, but signing
  // out would end the admin's own session - send them back to the list instead.
  const me = useStudentMe();
  const acting = !!me?.viewAs;
  const leaveExam = useCallback(() => {
    if (acting) window.location.href = '/student/dashboard/quick-exams';
    else signOut({ callbackUrl: `/student/signin?callbackUrl=${encodeURIComponent(`/student/dashboard/quick-exams/${qid}`)}` });
  }, [acting, qid]);
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(false);
  const [offset, setOffset] = useState(0);
  const [current, setCurrent] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  // Marked for review: only a reminder for the student, never sent to the server.
  const [flagged, setFlagged] = useState<Set<number>>(new Set());

  // While these are true, leaving full screen (or the page) is the exam's own doing.
  const writingRef = useRef(false);
  const leavingOnPurpose = useRef(false);
  const submittingRef = useRef(false);

  const url = `/api/student/quick-exams/${qid}`;
  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(d.error || 'Something went wrong'), { status: res.status });
      return d;
    },
    [url]
  );

  const acceptPaper = useCallback((p: Paper | null) => {
    setPaper(p);
    if (p) setOffset(new Date(p.serverNow).getTime() - Date.now());
  }, []);

  // Load - and if the student left the page mid-exam last time, finish signing them out.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(violatedKey(qid))) {
        sessionStorage.removeItem(violatedKey(qid));
        setLeft(true);
        return;
      }
    } catch {
      /* no storage */
    }
    (async () => {
      try {
        const res = await fetch(url);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load');
        setExam(d.exam);
        acceptPaper(d.paper);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
  }, [qid, url, acceptPaper]);

  const needsFullscreen = !!exam?.requireFullscreen;
  const writing = !!paper && !paper.submitted && (!needsFullscreen || fullscreen);
  useEffect(() => {
    writingRef.current = writing && !left;
  }, [writing, left]);

  // Left full screen (Esc, F11, switching away): answers are cleared and the student signed out.
  const onLeft = useCallback(() => {
    if (!writingRef.current || leavingOnPurpose.current || submittingRef.current) return;
    writingRef.current = false;
    setLeft(true);
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'violation' }), keepalive: true })
      .catch(() => undefined)
      .finally(() => window.setTimeout(leaveExam, 3500));
  }, [url, leaveExam]);

  useEffect(() => {
    const update = () => {
      const fs = isFullscreen();
      setFullscreen(fs);
      if (!fs && needsFullscreen) onLeft();
    };
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, [needsFullscreen, onLeft]);

  // Reloading or closing the page mid-exam leaves full screen too - same rule.
  useEffect(() => {
    const onHide = () => {
      if (!needsFullscreen || !writingRef.current || leavingOnPurpose.current || submittingRef.current) return;
      navigator.sendBeacon(url, new Blob([JSON.stringify({ action: 'violation' })], { type: 'application/json' }));
      try {
        sessionStorage.setItem(violatedKey(qid), '1');
      } catch {
        /* no storage */
      }
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [needsFullscreen, url, qid]);

  // After a violation: say what happened, then sign out.
  useEffect(() => {
    if (!left) return;
    exitFullscreen();
    const t = window.setTimeout(leaveExam, 4000);
    return () => window.clearTimeout(t);
  }, [left, leaveExam]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      if (needsFullscreen) {
        await enterFullscreen();
        setFullscreen(isFullscreen());
      }
      if (!paper) {
        const d = await post({ action: 'start' });
        acceptPaper(d.paper);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start');
      if (!paper) await exitFullscreen();
    } finally {
      setBusy(false);
    }
  };

  const submit = useCallback(
    async (auto = false) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setBusy(true);
      try {
        const d = await post({ action: 'submit' });
        leavingOnPurpose.current = true;
        acceptPaper(d.paper);
        await exitFullscreen();
      } catch (err) {
        submittingRef.current = false;
        if (!auto) setError(err instanceof Error ? err.message : 'Could not submit - check your connection and try again');
      } finally {
        setBusy(false);
        setConfirmSubmit(false);
      }
    },
    [post, acceptPaper]
  );

  const choose = async (position: number, choice: number) => {
    if (!paper || !writing) return;
    const prev = paper.answers[position];
    setPaper({ ...paper, answers: paper.answers.map((a, i) => (i === position ? choice : a)) });
    setSaveState('saving');
    try {
      await post({ action: 'answer', position, choice });
      setSaveState('saved');
    } catch (err) {
      if ((err as { status?: number }).status === 409) {
        submit(true);
        return;
      }
      setSaveState('error');
      setPaper((p) => (p ? { ...p, answers: p.answers.map((a, i) => (i === position ? prev : a)) } : p));
    }
  };

  // The countdown, on the server's clock. At zero the paper is submitted.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!writing) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [writing]);
  const remaining = paper ? Math.max(0, new Date(paper.deadline).getTime() - (now + offset)) : 0;
  useEffect(() => {
    if (writing && paper && remaining <= 0) submit(true);
  }, [writing, paper, remaining, submit]);

  // Keyboard: A-H / 1-8 to answer, arrows to move.
  useEffect(() => {
    if (!writing || !paper) return;
    const onKey = (e: KeyboardEvent) => {
      if (confirmSubmit) return;
      const q = paper.questions[current];
      const letter = 'abcdefgh'.indexOf(e.key.toLowerCase());
      const digit = Number(e.key) - 1;
      const pick = letter >= 0 ? letter : digit >= 0 && digit < 8 ? digit : -1;
      if (pick >= 0 && pick < q.options.length) choose(current, pick);
      else if (e.key === 'ArrowRight') setCurrent((c) => Math.min(c + 1, paper.questions.length - 1));
      else if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(c - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writing, paper, current, confirmSubmit]);


  const answered = paper ? paper.answers.filter((a) => a !== null && a !== undefined).length : 0;
  const toggleFlag = (i: number) =>
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // ── Screens ──
  if (left) return <LeftScreen />;
  if (error && !exam)
    return (
      <Shell>
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-destructive">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">This exam couldn&apos;t be opened</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        </div>
      </Shell>
    );
  if (!exam)
    return (
      <Shell>
        <IntroSkeleton />
      </Shell>
    );
  if (paper?.submitted) return <DoneScreen exam={exam} paper={paper} />;
  if (writing && paper) {
    return (
      <WritingScreen
        paper={paper}
        current={current}
        setCurrent={setCurrent}
        choose={choose}
        flagged={flagged}
        toggleFlag={toggleFlag}
        remaining={remaining}
        answered={answered}
        saveState={saveState}
        busy={busy}
        error={error}
        confirmSubmit={confirmSubmit}
        setConfirmSubmit={setConfirmSubmit}
        submit={() => submit(false)}
      />
    );
  }
  return <IntroScreen exam={exam} paper={paper} busy={busy} error={error} start={start} />;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// ── Before starting (or returning to full screen) ──────────────────────────────────────────

/** The exam's intro and results, inside the student portal (writing is full screen). */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <StudentShell>
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
          <Link href="/student/dashboard/quick-exams">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All quick exams
          </Link>
        </Button>
        {children}
      </div>
    </StudentShell>
  );
}

function IntroSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading the exam">
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-8 w-2/3 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-muted" />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function IntroScreen({ exam, paper, busy, error, start }: { exam: ExamInfo; paper: Paper | null; busy: boolean; error: string | null; start: () => void }) {
  // Read from the browser; assumed supported while rendering on the server.
  const supported = useSyncExternalStore(
    () => () => undefined,
    fullscreenSupported,
    () => true
  );
  const [agreed, setAgreed] = useState(false);
  const blocked = exam.requireFullscreen && !supported;
  const resuming = !!paper;
  const canStart = resuming || exam.availability === 'open';
  const needsAgreement = exam.requireFullscreen && !resuming;

  const rules = [
    { icon: Shuffle, text: 'You get your own paper - questions and options are in a different order for everyone.' },
    { icon: Timer, text: 'The timer starts when you press Start and keeps running even if you close the page. When it ends, your paper is submitted automatically.' },
    { icon: Save, text: 'Every answer is saved the moment you choose it. You can change it until you submit.' },
  ];

  return (
    <Shell>
      <div className="space-y-6">
        <header>
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <BookOpen className="h-4 w-4" aria-hidden /> {exam.course}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">{exam.title}</h1>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat icon={ListChecks} label="Questions" value={String(exam.questions)} />
          <Stat icon={Clock} label="Time limit" value={`${exam.durationMinutes} min`} />
          {exam.closesAt && <Stat icon={CalendarClock} label="Closes" value={fmtDate(exam.closesAt)} />}
        </div>

        {resuming && paper!.violations > 0 && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              <span className="font-semibold">Your answers were cleared.</span> You left full screen earlier. Your timer kept running - answer again before
              it ends.
            </p>
          </div>
        )}

        {exam.instructions && (
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-2 text-sm font-semibold">Instructions from your teacher</h2>
            <MathMarkdown className="text-[15px] leading-relaxed">{exam.instructions}</MathMarkdown>
          </section>
        )}

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Before you {resuming ? 'continue' : 'start'}</h2>
          <ul className="space-y-3">
            {rules.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
          {exam.requireFullscreen && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm">
              <Maximize className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <p>
                <span className="font-semibold">This exam runs in full screen.</span> Leaving it - Esc, switching apps or tabs, reloading or closing the page -{' '}
                <span className="font-semibold text-destructive">clears all your answers and signs you out.</span>
              </p>
            </div>
          )}
        </section>

        {blocked && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            This browser can&apos;t go full screen (iPhones can&apos;t). Use a laptop or desktop, or an Android phone with Chrome.
          </div>
        )}

        <div className="space-y-3 rounded-xl border bg-card p-5">
          {needsAgreement && canStart && !blocked && (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>I have read the rules and I&apos;m ready to stay in full screen until I submit.</span>
            </label>
          )}
          {exam.availability === 'upcoming' && !resuming && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Opens {exam.opensAt ? fmtDate(exam.opensAt) : 'soon'}.
            </p>
          )}
          {exam.availability === 'closed' && !resuming && <p className="text-sm text-muted-foreground">This exam is closed.</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="h-12 w-full text-base" onClick={start} disabled={busy || blocked || !canStart || (needsAgreement && !agreed)}>
            {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : exam.requireFullscreen ? <Maximize className="mr-2 h-5 w-5" /> : <ArrowRight className="mr-2 h-5 w-5" />}
            {resuming ? (exam.requireFullscreen ? 'Return to full screen and continue' : 'Continue') : exam.requireFullscreen ? 'Start exam in full screen' : 'Start exam'}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

// ── Writing ───────────────────────────────────────────────────────────────────────────────

function WritingScreen(props: {
  paper: Paper;
  current: number;
  setCurrent: (n: number) => void;
  choose: (p: number, c: number) => void;
  flagged: Set<number>;
  toggleFlag: (i: number) => void;
  remaining: number;
  answered: number;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  busy: boolean;
  error: string | null;
  confirmSubmit: boolean;
  setConfirmSubmit: (v: boolean) => void;
  submit: () => void;
}) {
  const { paper, current, setCurrent, choose, flagged, toggleFlag, remaining, answered, saveState, busy, error, confirmSubmit, setConfirmSubmit, submit } = props;
  const q = paper.questions[current];
  const total = paper.questions.length;
  const h = Math.floor(remaining / 3_600_000);
  const mins = Math.floor((remaining % 3_600_000) / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const clock = `${h > 0 ? `${h}:${String(mins).padStart(2, '0')}` : mins}:${String(secs).padStart(2, '0')}`;
  const tone = remaining < 60_000 ? 'critical' : remaining < 5 * 60_000 ? 'warn' : 'normal';
  const isAnswered = (i: number) => paper.answers[i] !== null && paper.answers[i] !== undefined;
  const unanswered = paper.questions.map((_, i) => i).filter((i) => !isAnswered(i));
  const isFlagged = flagged.has(current);
  const reviewLists: Array<[string, number[]]> = [
    ['Not answered', unanswered],
    ['Marked for review', [...flagged].sort((a, b) => a - b)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-muted/30">
      {/* Top bar: what, how far, how long */}
      <header className="shrink-0 border-b bg-background">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold sm:text-base">{paper.title}</h1>
            <p className="text-xs tabular-nums text-muted-foreground">
              {answered} of {total} answered
            </p>
          </div>
          <span className={cn('hidden items-center gap-1.5 text-xs sm:flex', saveState === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
            {saveState === 'saving' ? (
              <>
                <CloudUpload className="h-4 w-4" /> Saving…
              </>
            ) : saveState === 'saved' ? (
              <>
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> All answers saved
              </>
            ) : saveState === 'error' ? (
              <>
                <CloudOff className="h-4 w-4" /> Not saved - choose again
              </>
            ) : null}
          </span>
          <div
            role="timer"
            aria-label={`Time left ${clock}`}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-base font-semibold tabular-nums sm:text-lg',
              tone === 'critical'
                ? 'border-destructive/50 bg-destructive/10 text-destructive motion-safe:animate-pulse'
                : tone === 'warn'
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'bg-background'
            )}
          >
            <Clock className="h-4 w-4" aria-hidden />
            {clock}
          </div>
          <Button onClick={() => setConfirmSubmit(true)} disabled={busy} className="h-9">
            Submit
          </Button>
        </div>
        <div className="h-1 bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${(answered / total) * 100}%` }} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
            <div className="rounded-2xl border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b px-5 py-3 sm:px-6">
                <p className="text-sm font-semibold">
                  Question {current + 1} <span className="font-normal text-muted-foreground">of {total}</span>
                </p>
                <button
                  type="button"
                  onClick={() => toggleFlag(current)}
                  aria-pressed={isFlagged}
                  className={cn(
                    'flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors',
                    isFlagged ? 'bg-amber-500/15 font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Flag className={cn('h-4 w-4', isFlagged && 'fill-current')} aria-hidden />
                  {isFlagged ? 'Marked for review' : 'Mark for review'}
                </button>
              </div>
              <div className="space-y-5 p-5 sm:p-6">
                <MathMarkdown className="text-[17px] leading-relaxed">{q.stem}</MathMarkdown>
                <div className="space-y-2.5" role="radiogroup" aria-label={`Question ${current + 1} options`}>
                  {q.options.map((o, oi) => {
                    const picked = paper.answers[current] === oi;
                    return (
                      <button
                        key={oi}
                        type="button"
                        role="radio"
                        aria-checked={picked}
                        onClick={() => choose(current, oi)}
                        className={cn(
                          'flex w-full cursor-pointer items-start gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          picked ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40 hover:bg-muted/50'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                            picked ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
                          )}
                        >
                          {picked ? <Check className="h-4 w-4" aria-hidden /> : optionLetter(oi)}
                        </span>
                        <MathMarkdown inline className="flex-1 pt-0.5 text-[15px]">
                          {o}
                        </MathMarkdown>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" className="h-11" onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Previous
              </Button>
              <p className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
                <Keyboard className="h-3.5 w-3.5" aria-hidden /> Press A–{optionLetter(q.options.length - 1)} to answer, ← → to move
              </p>
              {current < total - 1 ? (
                <Button className="h-11" onClick={() => setCurrent(current + 1)}>
                  Next <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button className="h-11" onClick={() => setConfirmSubmit(true)}>
                  Review and submit
                </Button>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </main>

        {/* Question navigator */}
        <aside className="shrink-0 border-t bg-background md:w-72 md:overflow-y-auto md:border-l md:border-t-0" aria-label="Questions">
          <div className="p-3 md:p-5">
            <p className="mb-3 hidden text-sm font-semibold md:block">Questions</p>
            <div className="flex gap-1.5 overflow-x-auto p-1 md:grid md:grid-cols-5 md:gap-2 md:overflow-visible">
              {paper.questions.map((_, i) => {
                const done = isAnswered(i);
                const flag = flagged.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-label={`Question ${i + 1}${done ? ', answered' : ', not answered'}${flag ? ', marked for review' : ''}`}
                    aria-current={i === current ? 'step' : undefined}
                    className={cn(
                      'relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors md:w-auto',
                      done ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                      i === current && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    )}
                  >
                    {i + 1}
                    {flag && <Flag className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden />}
                  </button>
                );
              })}
            </div>
            <dl className="mt-5 hidden space-y-2 border-t pt-4 text-sm md:block">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-3 w-3 rounded-sm bg-primary" /> Answered
                </dt>
                <dd className="font-semibold tabular-nums">{answered}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-3 w-3 rounded-sm border bg-background" /> Not answered
                </dt>
                <dd className="font-semibold tabular-nums">{total - answered}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Flag className="h-3 w-3 fill-amber-500 text-amber-500" /> Marked for review
                </dt>
                <dd className="font-semibold tabular-nums">{flagged.size}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {confirmSubmit && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-2xl">
            <div>
              <h2 id="submit-title" className="text-lg font-semibold">
                Submit your exam?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">You can&apos;t change any answer after submitting.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-bold tabular-nums">{answered}</p>
                <p className="text-xs text-muted-foreground">Answered</p>
              </div>
              <div className={cn('rounded-lg border p-3', unanswered.length > 0 && 'border-destructive/40 bg-destructive/5')}>
                <p className={cn('text-2xl font-bold tabular-nums', unanswered.length > 0 && 'text-destructive')}>{unanswered.length}</p>
                <p className="text-xs text-muted-foreground">Not answered</p>
              </div>
              <div className={cn('rounded-lg border p-3', flagged.size > 0 && 'border-amber-500/40 bg-amber-500/5')}>
                <p className="text-2xl font-bold tabular-nums">{flagged.size}</p>
                <p className="text-xs text-muted-foreground">For review</p>
              </div>
            </div>
            {reviewLists.some(([, list]) => list.length > 0) && (
              <div className="space-y-2 text-sm">
                {reviewLists.map(([label, list]) =>
                  list.length ? (
                    <div key={label} className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-muted-foreground">{label}:</span>
                      {list.map((i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setCurrent(i);
                            setConfirmSubmit(false);
                          }}
                          className="min-h-8 min-w-8 cursor-pointer rounded-md border px-2 text-xs font-semibold tabular-nums hover:bg-muted"
                          aria-label={`Go to question ${i + 1}`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="h-11" onClick={() => setConfirmSubmit(false)} disabled={busy}>
                Keep working
              </Button>
              <Button className="h-11" onClick={submit} disabled={busy}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Submit exam
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── After ─────────────────────────────────────────────────────────────────────────────────

function ScoreRing({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90" aria-hidden>
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="stroke-primary"
      />
    </svg>
  );
}

function DoneScreen({ exam, paper }: { exam: ExamInfo; paper: Paper }) {
  const correct = paper.result?.correct ?? 0;
  const total = paper.result?.total ?? paper.questions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const skipped = paper.answers.filter((a) => a === null || a === undefined).length;
  const wrong = Math.max(0, total - correct - skipped);
  const [only, setOnly] = useState<'all' | 'wrong'>('all');
  const shown = paper.review ? paper.questions.map((q, i) => ({ q, i, r: paper.review![i] })).filter((x) => only === 'all' || !x.r.right) : [];

  return (
    <Shell>
      <div className="space-y-8">
        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <div className="relative shrink-0">
              <ScoreRing pct={pct} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold tabular-nums">{pct}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700 sm:justify-start dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> {paper.autoSubmitted ? 'Submitted automatically when time ran out' : 'Submitted'}
              </p>
              <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{exam.title}</h1>
              <p className="text-sm text-muted-foreground">{exam.course}</p>
              <p className="mt-3 text-3xl font-bold tabular-nums">
                {correct} <span className="text-lg font-medium text-muted-foreground">/ {total} correct</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Your mark has been recorded.</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t pt-5 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{correct}</p>
              <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> Correct
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-destructive">{wrong}</p>
              <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <XCircle className="h-3 w-3" aria-hidden /> Wrong
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{skipped}</p>
              <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Circle className="h-3 w-3" aria-hidden /> Not answered
              </p>
            </div>
          </div>
        </section>

        {paper.review && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Review your answers</h2>
              <div className="flex rounded-lg border bg-background p-0.5" role="tablist" aria-label="Show">
                {(
                  [
                    ['all', `All (${total})`],
                    ['wrong', `Missed (${total - correct})`],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={only === k}
                    onClick={() => setOnly(k)}
                    className={cn(
                      'min-h-8 cursor-pointer rounded-md px-3 text-sm transition-colors',
                      only === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {shown.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing missed - every answer is correct.</p>}
            {shown.map(({ q, i, r }) => {
              const mine = paper.answers[i];
              return (
                <article key={i} className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-2.5 text-sm">
                    {r.right ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <XCircle className="h-4 w-4 text-destructive" aria-hidden />}
                    <span className="font-semibold">Question {i + 1}</span>
                    <span className={cn('ml-auto text-xs font-medium', r.right ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
                      {r.right ? 'Correct' : mine === null || mine === undefined ? 'Not answered' : 'Incorrect'}
                    </span>
                  </div>
                  <div className="space-y-3 p-5">
                    <MathMarkdown className="leading-relaxed">{q.stem}</MathMarkdown>
                    <div className="space-y-2">
                      {q.options.map((o, oi) => {
                        const isRight = oi === r.correctOption;
                        const isMine = oi === mine;
                        return (
                          <div
                            key={oi}
                            className={cn(
                              'flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm',
                              isRight && 'border-emerald-500/50 bg-emerald-500/5',
                              isMine && !isRight && 'border-destructive/50 bg-destructive/5'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                                isRight && 'border-emerald-600 bg-emerald-600 text-white',
                                isMine && !isRight && 'border-destructive bg-destructive text-white'
                              )}
                            >
                              {optionLetter(oi)}
                            </span>
                            <MathMarkdown inline className="flex-1 pt-0.5">
                              {o}
                            </MathMarkdown>
                            {(isRight || isMine) && (
                              <span className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-xs font-medium">
                                {isRight && <span className="text-emerald-700 dark:text-emerald-400">Correct answer</span>}
                                {isMine && <span className={isRight ? 'text-muted-foreground' : 'text-destructive'}>Your answer</span>}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/student/dashboard/quick-exams">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to quick exams
          </Link>
        </Button>
      </div>
    </Shell>
  );
}

function LeftScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
      <div role="alert" className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </span>
        <h1 className="text-xl font-bold">You left full screen</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          As the exam rules say, your answers have been cleared and you are being signed out. Sign in again to continue while your time lasts - the timer is
          still running.
        </p>
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Signing you out…
        </p>
      </div>
    </div>
  );
}
