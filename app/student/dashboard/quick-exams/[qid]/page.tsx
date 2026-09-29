'use client';

import { use as usePromise, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2, Maximize, ShieldAlert, XCircle } from 'lucide-react';
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
      .finally(() => window.setTimeout(() => signOut({ callbackUrl: `/student/signin?callbackUrl=${encodeURIComponent(`/student/dashboard/quick-exams/${qid}`)}` }), 3500));
  }, [url, qid]);

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
    const t = window.setTimeout(() => signOut({ callbackUrl: `/student/signin?callbackUrl=${encodeURIComponent(`/student/dashboard/quick-exams/${qid}`)}` }), 4000);
    return () => window.clearTimeout(t);
  }, [left, qid]);

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

  // ── Screens ──
  if (left) return <LeftScreen />;
  if (error && !exam) return <Shell><p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">{error}</p></Shell>;
  if (!exam) return <Shell><div className="flex justify-center py-24 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div></Shell>;
  if (paper?.submitted) return <DoneScreen exam={exam} paper={paper} />;
  if (writing && paper) {
    return (
      <WritingScreen
        paper={paper}
        current={current}
        setCurrent={setCurrent}
        choose={choose}
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

// ── Before starting (or returning to full screen) ──────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/student/dashboard/quick-exams">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Quick exams
            </Link>
          </Button>
        </div>
      </nav>
      <main className="mx-auto max-w-2xl p-4 pt-8">{children}</main>
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
  const blocked = exam.requireFullscreen && !supported;
  const resuming = !!paper;
  const canStart = resuming || exam.availability === 'open';
  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{exam.course}</p>
          <h1 className="text-2xl font-bold">{exam.title}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
            <span>{exam.questions} questions</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {exam.durationMinutes} minutes
            </span>
            {exam.closesAt && <span>closes {new Date(exam.closesAt).toLocaleString()}</span>}
          </p>
        </div>
        {exam.instructions && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <MathMarkdown>{exam.instructions}</MathMarkdown>
          </div>
        )}
        {resuming && paper!.violations > 0 && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            You left full screen earlier, so your answers were cleared. Your timer kept running - answer again before it ends.
          </p>
        )}
        <div className="space-y-2 rounded-xl border p-4 text-sm">
          <p className="font-semibold">Before you {resuming ? 'continue' : 'start'}</p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>You get your own paper - the questions and options are in a different order for everyone.</li>
            <li>The timer starts when you press Start and keeps running even if you close the page. When it ends, your paper is submitted automatically.</li>
            <li>Every answer is saved the moment you choose it.</li>
            {exam.requireFullscreen && (
              <li className="font-medium text-foreground">
                The exam runs in full screen. If you leave full screen - Esc, switching apps, reloading or closing the page - <span className="text-destructive">all your answers are cleared and you are signed out.</span>
              </li>
            )}
          </ul>
        </div>
        {blocked && (
          <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            This browser can&apos;t go full screen (iPhones can&apos;t). Use a laptop or desktop, or an Android phone with Chrome.
          </p>
        )}
        {exam.availability === 'upcoming' && !resuming && <p className="text-sm text-muted-foreground">It opens {exam.opensAt ? new Date(exam.opensAt).toLocaleString() : 'soon'}.</p>}
        {exam.availability === 'closed' && !resuming && <p className="text-sm text-muted-foreground">This exam is closed.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="lg" className="w-full" onClick={start} disabled={busy || blocked || !canStart}>
          {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : exam.requireFullscreen ? <Maximize className="mr-2 h-5 w-5" /> : null}
          {resuming ? (exam.requireFullscreen ? 'Return to full screen and continue' : 'Continue') : exam.requireFullscreen ? 'Start in full screen' : 'Start'}
        </Button>
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
  remaining: number;
  answered: number;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  busy: boolean;
  error: string | null;
  confirmSubmit: boolean;
  setConfirmSubmit: (v: boolean) => void;
  submit: () => void;
}) {
  const { paper, current, setCurrent, choose, remaining, answered, saveState, busy, error, confirmSubmit, setConfirmSubmit, submit } = props;
  const q = paper.questions[current];
  const total = paper.questions.length;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const low = remaining < 60_000;
  const unanswered = total - answered;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <h1 className="min-w-0 flex-1 truncate font-semibold">{paper.title}</h1>
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {answered}/{total} answered
        </span>
        <span className={cn('text-xs', saveState === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved - try again' : ''}
        </span>
        <span className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums', low ? 'bg-destructive/15 text-destructive' : 'bg-muted')} aria-label="Time left">
          <Clock className="h-4 w-4" />
          {mins}:{String(secs).padStart(2, '0')}
        </span>
        <Button onClick={() => setConfirmSubmit(true)} disabled={busy}>
          Submit
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto max-w-3xl space-y-5">
            <p className="text-sm font-medium text-muted-foreground">
              Question {current + 1} of {total}
            </p>
            <MathMarkdown className="text-lg">{q.stem}</MathMarkdown>
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
                      'flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors',
                      picked ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-muted/40'
                    )}
                  >
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold', picked ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                      {optionLetter(oi)}
                    </span>
                    <MathMarkdown inline className="flex-1 pt-0.5">
                      {o}
                    </MathMarkdown>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Previous
              </Button>
              {current < total - 1 ? (
                <Button variant="outline" onClick={() => setCurrent(current + 1)}>
                  Next <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => setConfirmSubmit(true)}>Finish</Button>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </main>

        {/* Question palette */}
        <aside className="shrink-0 border-t p-3 md:w-60 md:border-l md:border-t-0 md:p-4">
          <p className="mb-2 hidden text-xs font-medium text-muted-foreground md:block">Questions</p>
          <div className="flex gap-1.5 overflow-x-auto md:grid md:grid-cols-5 md:overflow-visible">
            {paper.questions.map((_, i) => {
              const done = paper.answers[i] !== null && paper.answers[i] !== undefined;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-label={`Question ${i + 1}${done ? ', answered' : ''}`}
                  aria-current={i === current ? 'step' : undefined}
                  className={cn(
                    'h-9 w-9 shrink-0 rounded-lg border text-sm font-semibold tabular-nums',
                    done ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                    i === current && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {confirmSubmit && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Submit the exam">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Submit your answers?</h2>
            <p className="text-sm text-muted-foreground">
              {unanswered > 0 ? (
                <>
                  <span className="font-medium text-destructive">
                    {unanswered} question{unanswered === 1 ? ' is' : 's are'} unanswered.
                  </span>{' '}
                  You can&apos;t change anything after submitting.
                </>
              ) : (
                "You've answered every question. You can't change anything after submitting."
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmSubmit(false)} disabled={busy}>
                Keep writing
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── After ─────────────────────────────────────────────────────────────────────────────────

function DoneScreen({ exam, paper }: { exam: ExamInfo; paper: Paper }) {
  const correct = paper.result?.correct ?? 0;
  const total = paper.result?.total ?? paper.questions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return (
    <Shell>
      <div className="space-y-6">
        <div className="space-y-3 rounded-2xl border p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="text-sm text-muted-foreground">{exam.title}</p>
          <p className="text-4xl font-bold tabular-nums">
            {correct} <span className="text-2xl text-muted-foreground">/ {total}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {pct}% · {paper.autoSubmitted ? 'submitted automatically when time ran out' : 'submitted'} · your mark has been recorded
          </p>
        </div>
        {paper.review && (
          <div className="space-y-3">
            <h2 className="font-semibold">Your answers</h2>
            {paper.questions.map((q, i) => {
              const r = paper.review![i];
              const mine = paper.answers[i];
              return (
                <article key={i} className={cn('rounded-xl border p-4', r.right ? 'border-emerald-500/40' : 'border-destructive/40')}>
                  <div className="flex gap-2">
                    {r.right ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
                    <MathMarkdown className="flex-1">{`**${i + 1}.** ${q.stem}`}</MathMarkdown>
                  </div>
                  <div className="mt-3 space-y-1.5 pl-7">
                    {q.options.map((o, oi) => (
                      <div
                        key={oi}
                        className={cn(
                          'flex items-start gap-2 rounded-lg border px-3 py-1.5 text-sm',
                          oi === r.correctOption && 'border-emerald-500/60 bg-emerald-500/10',
                          oi === mine && oi !== r.correctOption && 'border-destructive/60 bg-destructive/10'
                        )}
                      >
                        <span className="font-semibold">{optionLetter(oi)}.</span>
                        <MathMarkdown inline className="flex-1">
                          {o}
                        </MathMarkdown>
                        {oi === mine && <span className="text-xs text-muted-foreground">your answer</span>}
                      </div>
                    ))}
                    {mine === null && <p className="text-xs text-muted-foreground">Not answered</p>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <Button asChild variant="outline" className="w-full">
          <Link href="/student/dashboard/quick-exams">Back to quick exams</Link>
        </Button>
      </div>
    </Shell>
  );
}

function LeftScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">You left full screen</h1>
        <p className="text-muted-foreground">
          As the exam rules say, all your answers have been cleared and you are being signed out. You can sign in again and continue while your time lasts - your timer is still running.
        </p>
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
