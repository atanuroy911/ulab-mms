'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, Loader2, PlayCircle, Zap } from 'lucide-react';
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

export default function StudentQuickExamsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/student/dashboard">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Dashboard
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4 text-primary" /> Quick Exams
          </h1>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl space-y-8 p-4 pt-6">
        {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
        {!items && !error && (
          <div className="flex justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {groups && items!.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            <Zap className="mx-auto mb-3 h-8 w-8 opacity-50" />
            No quick exams right now. When a teacher publishes one for your course, it appears here.
          </div>
        )}
        {groups && (
          <>
            <Section title="Available now" items={groups.now} />
            <Section title="Coming up" items={groups.later} />
            <Section title="Done" items={groups.done} />
          </>
        )}
      </main>
    </div>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {items.map((i) => {
        const open = i.availability === 'open' || i.state === 'in progress';
        return (
          <Link
            key={i._id}
            href={`/student/dashboard/quick-exams/${i._id}`}
            className={cn('flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50', i.state === 'in progress' && 'border-primary/60')}
          >
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', i.state === 'submitted' ? 'bg-emerald-500/15 text-emerald-600' : open ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
              {i.state === 'submitted' ? <CheckCircle2 className="h-5 w-5" /> : open ? <PlayCircle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{i.title}</span>
              <span className="block truncate text-sm text-muted-foreground">{i.course}</span>
              <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{i.questions} questions</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {i.durationMinutes} min
                </span>
                {i.availability === 'upcoming' && i.opensAt && <span>opens {new Date(i.opensAt).toLocaleString()}</span>}
                {i.availability === 'open' && i.closesAt && i.state !== 'submitted' && <span>closes {new Date(i.closesAt).toLocaleString()}</span>}
              </span>
            </span>
            <span className="shrink-0 text-right text-sm">
              {i.state === 'submitted' ? (
                <span className="font-semibold tabular-nums">
                  {i.result?.correct ?? '-'} / {i.result?.total}
                </span>
              ) : i.state === 'in progress' ? (
                <span className="font-medium text-primary">Continue</span>
              ) : open ? (
                <span className="font-medium text-primary">Start</span>
              ) : (
                <span className="text-muted-foreground">Not open yet</span>
              )}
            </span>
          </Link>
        );
      })}
    </section>
  );
}
