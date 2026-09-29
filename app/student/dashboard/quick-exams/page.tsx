'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, CalendarClock, CheckCircle2, Clock, ListChecks, PlayCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';

interface Item {
  _id: string;
  title: string;
  course: string;
  questions: number;
  durationMinutes: number;
  opensAt: string | null;
  closesAt: string | null;
  availability: 'upcoming' | 'open' | 'closed';
  state: 'not started' | 'in progress' | 'submitted';
  result: { correct: number | null; total: number } | null;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** "in 3 h", "in 2 days" - close deadlines read faster than a date. */
function relative(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `in ${h} h`;
  return `in ${Math.round(h / 24)} days`;
}

export default function StudentQuickExamsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read once: "closes in 3 h" doesn't need to tick.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/student/quick-exams');
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load');
        setItems(d.exams);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
  }, []);

  const groups = items && {
    now: items.filter((i) => i.state === 'in progress' || (i.availability === 'open' && i.state === 'not started')),
    later: items.filter((i) => i.availability === 'upcoming' && i.state === 'not started'),
    done: items.filter((i) => i.state === 'submitted'),
  };

  return (
    <div className="min-h-dvh bg-muted/30">
      <nav className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/student/dashboard">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Dashboard
            </Link>
          </Button>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:py-10">
        <header className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Zap className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Quick Exams</h1>
            <p className="text-sm text-muted-foreground">Short timed tests from your courses</p>
          </div>
        </header>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {!items && !error && (
          <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading quick exams">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-muted" />
            ))}
          </div>
        )}
        {groups && items!.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Zap className="h-6 w-6 text-muted-foreground" aria-hidden />
            </span>
            <p className="mt-4 font-medium">No quick exams right now</p>
            <p className="mt-1 text-sm text-muted-foreground">When a teacher publishes one for your course, it appears here.</p>
          </div>
        )}
        {groups && (
          <>
            {groups.now.length > 0 && (
              <Section title="Available now" count={groups.now.length}>
                {groups.now.map((i) => (
                  <OpenCard key={i._id} item={i} now={now} />
                ))}
              </Section>
            )}
            {groups.later.length > 0 && (
              <Section title="Coming up" count={groups.later.length}>
                {groups.later.map((i) => (
                  <UpcomingRow key={i._id} item={i} />
                ))}
              </Section>
            )}
            {groups.done.length > 0 && (
              <Section title="Completed" count={groups.done.length}>
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {groups.done.map((i) => (
                    <DoneRow key={i._id} item={i} />
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {title}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Meta({ item: i }: { item: Item }) {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <ListChecks className="h-4 w-4" aria-hidden /> {i.questions} questions
      </span>
      <span className="flex items-center gap-1.5">
        <Clock className="h-4 w-4" aria-hidden /> {i.durationMinutes} min
      </span>
    </span>
  );
}

/** Open or in progress: the one thing to act on, so it gets a real button. */
function OpenCard({ item: i, now }: { item: Item; now: number }) {
  const inProgress = i.state === 'in progress';
  const closesIn = i.closesAt ? relative(i.closesAt, now) : null;
  const soon = !!i.closesAt && new Date(i.closesAt).getTime() - now < 24 * 3600_000;
  return (
    <article className={cn('rounded-xl border bg-card p-5 shadow-sm', inProgress && 'border-primary/50 ring-1 ring-primary/30')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> {i.course}
            </span>
            {inProgress && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">In progress</span>
            )}
          </div>
          <h3 className="text-lg font-semibold leading-snug">{i.title}</h3>
          <Meta item={i} />
          {i.closesAt && (
            <p className={cn('flex items-center gap-1.5 text-xs', soon ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Closes {fmtDate(i.closesAt)}
              {closesIn && ` (${closesIn})`}
            </p>
          )}
        </div>
        <Button asChild size="lg" className="h-11 shrink-0 sm:w-40">
          <Link href={`/student/dashboard/quick-exams/${i._id}`}>
            {inProgress ? (
              <>
                Continue <ArrowRight className="ml-1.5 h-4 w-4" />
              </>
            ) : (
              <>
                <PlayCircle className="mr-1.5 h-4 w-4" /> Start
              </>
            )}
          </Link>
        </Button>
      </div>
    </article>
  );
}

function UpcomingRow({ item: i }: { item: Item }) {
  return (
    <Link
      href={`/student/dashboard/quick-exams/${i._id}`}
      className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <CalendarClock className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{i.title}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {i.course} · {i.questions} questions · {i.durationMinutes} min
        </span>
      </span>
      <span className="shrink-0 text-right text-sm">
        <span className="block text-xs text-muted-foreground">Opens</span>
        <span className="font-medium">{i.opensAt ? fmtDate(i.opensAt) : 'Soon'}</span>
      </span>
    </Link>
  );
}

function DoneRow({ item: i }: { item: Item }) {
  const correct = i.result?.correct;
  const total = i.result?.total ?? i.questions;
  const pct = correct != null && total ? Math.round((correct / total) * 100) : null;
  return (
    <li>
      <Link href={`/student/dashboard/quick-exams/${i._id}`} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/50">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{i.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{i.course}</span>
        </span>
        <span className="hidden w-28 shrink-0 sm:block" aria-hidden>
          <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${pct ?? 0}%` }} />
          </span>
        </span>
        <span className="w-20 shrink-0 text-right">
          <span className="block font-semibold tabular-nums">
            {correct ?? '-'} / {total}
          </span>
          {pct != null && <span className="block text-xs tabular-nums text-muted-foreground">{pct}%</span>}
        </span>
      </Link>
    </li>
  );
}
