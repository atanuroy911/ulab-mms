'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, GraduationCap, PenLine, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isRunning } from '@/lib/capstoneStatus';
import { cn } from '@/lib/utils';

type Role = 'supervisor' | 'evaluator';

export interface SimpleGroup {
  _id: string;
  track: 'A' | 'B' | 'C';
  groupNumber: number;
  projectTitle: string;
  role: Role;
  supervisorName: string | null;
  session: { status: string } | null;
  members: Array<{ studentAccountId: string; name: string; studentId: string }>;
  journalUnreviewed: number;
  marks: Array<{ component: string; done: number; total: number }>;
}

const COMPONENT_LABEL: Record<string, string> = {
  report: 'Report',
  presentation: 'Presentation',
  peer: 'Peer',
  weeklyJournal: 'Journal',
  poster: 'Poster',
};

const cleanName = (name: string) => name.replace(/\s*\(\d+\)\s*$/, '');

const left = (g: SimpleGroup) => g.marks.reduce((n, c) => n + Math.max(0, c.total - c.done), 0);

/** Where "Enter marks" goes: supervisors to their marks tab, evaluators to the first unfinished sheet. */
function marksHref(g: SimpleGroup) {
  const base = `/capstone/groups/${g._id}`;
  if (g.role === 'supervisor') return `${base}?tab=supervisor-marks`;
  // Report and presentation have their own tabs; anything else (poster) is on the marks tab.
  const tabOf = (c: string) => (c === 'report' || c === 'presentation' ? c : 'supervisor-marks');
  const next = g.marks.find((m) => m.done < m.total) || g.marks[0];
  return `${base}?tab=${next ? tabOf(next.component) : 'report'}`;
}

const ROLE = {
  supervisor: {
    icon: GraduationCap,
    button: 'Submit marks as Supervisor',
    heading: 'Groups you supervise',
    none: "You don't supervise a group in a running semester.",
  },
  evaluator: {
    icon: ClipboardCheck,
    button: 'Submit marks as Evaluator',
    heading: 'Groups you evaluate',
    none: "You aren't an evaluator for a group in a running semester.",
  },
} as const;

/**
 * The default screen: pick a role with one big button, then pick a group - its marks, and (for a
 * supervisor) its weekly journals. Past semesters, reminders and the journals PDF live in the
 * Advanced view, which the home screen points to.
 */
export function SimpleMarksView({ groups, onAdvanced }: { groups: SimpleGroup[]; onAdvanced?: () => void }) {
  const running = useMemo(() => groups.filter((g) => isRunning(g.session?.status)), [groups]);
  const [role, setRole] = useState<Role | null>(null);

  // The chosen role is in the URL (?as=supervisor), so the browser's Back button returns here.
  useEffect(() => {
    const read = () => {
      const as = new URLSearchParams(window.location.search).get('as');
      setRole(as === 'supervisor' || as === 'evaluator' ? as : null);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const choose = (next: Role | null) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('as', next);
    else url.searchParams.delete('as');
    window.history.pushState(null, '', url);
    setRole(next);
    window.scrollTo({ top: 0 });
  };

  if (role) {
    const list = running.filter((g) => g.role === role);
    const { icon: Icon, heading, none } = ROLE[role];
    return (
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <Button variant="outline" size="lg" className="h-12 text-base" onClick={() => choose(null)}>
          <ArrowLeft className="mr-2 h-5 w-5" /> Back
        </Button>
        <h2 className="flex items-center gap-3 text-2xl font-bold">
          <Icon className="h-7 w-7 text-primary" aria-hidden /> {heading}
        </h2>
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-lg text-muted-foreground">{none}</p>
        ) : (
          <ul className="space-y-3">
            {list.map((g) => (
              <SimpleGroupCard key={g._id} group={g} />
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <h2 className="text-center text-2xl font-bold sm:text-3xl">What would you like to do?</h2>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        {(['supervisor', 'evaluator'] as const).map((r) => {
          const mine = running.filter((g) => g.role === r);
          const owed = mine.reduce((n, g) => n + left(g), 0);
          // A supervisor's most frequent job: journal weeks waiting for review.
          const journals = r === 'supervisor' ? mine.reduce((n, g) => n + g.journalUnreviewed, 0) : 0;
          const { icon: Icon, button } = ROLE[r];
          return (
            <button
              key={r}
              type="button"
              onClick={() => choose(r)}
              className={cn(
                'group flex min-h-56 cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 bg-card p-6 text-center shadow-sm',
                'transition-[border-color,box-shadow,transform] duration-200 hover:border-primary hover:shadow-md active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40',
                mine.length === 0 && 'opacity-70'
              )}
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-10 w-10" aria-hidden />
              </span>
              <span className="text-2xl font-bold leading-tight">{button}</span>
              <span className="text-base text-muted-foreground">
                {mine.length === 0 ? (
                  'No groups right now'
                ) : (
                  <>
                    {mine.length} {mine.length === 1 ? 'group' : 'groups'} ·{' '}
                    {owed > 0 ? (
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{owed} marks to submit</span>
                    ) : (
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">all marks in</span>
                    )}
                    {journals > 0 && (
                      <span className="mt-1 block font-semibold text-amber-600 dark:text-amber-400">
                        {journals} journal {journals === 1 ? 'week' : 'weeks'} to review
                      </span>
                    )}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {onAdvanced && (
        <p className="text-center text-sm text-muted-foreground">
          Past semesters, journal reminders and the journals PDF are in{' '}
          <button type="button" onClick={onAdvanced} className="font-medium text-primary hover:underline">
            Advanced
          </button>
          .
        </p>
      )}
    </div>
  );
}

function SimpleGroupCard({ group: g }: { group: SimpleGroup }) {
  const owed = left(g);
  const total = g.marks.reduce((n, c) => n + c.total, 0);
  const done = total > 0 && owed === 0;
  return (
    <li className={cn('rounded-2xl border-2 bg-card p-5', done ? 'border-emerald-500/40' : 'border-border')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">
            Track {g.track} · Group {g.groupNumber}
            {g.role === 'evaluator' && g.supervisorName ? ` · Supervisor: ${g.supervisorName}` : ''}
          </p>
          <p className="text-xl font-semibold leading-snug">{g.projectTitle}</p>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {g.members.map((m) => cleanName(m.name) || m.studentId).join(', ')}
          </p>
          {total > 0 && (
            <p className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-base', done ? 'text-emerald-700 dark:text-emerald-400' : '')}>
              {done ? (
                <span className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-5 w-5" aria-hidden /> All your marks are in
                </span>
              ) : (
                g.marks.map((c) => (
                  <span key={c.component} className={c.done >= c.total ? 'text-emerald-700 dark:text-emerald-400' : 'font-medium'}>
                    {c.done >= c.total && <CheckCircle2 className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden />}
                    {COMPONENT_LABEL[c.component] || c.component} {c.done}/{c.total}
                  </span>
                ))
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-52">
          <Button asChild size="lg" variant={done ? 'outline' : 'default'} className="h-14 text-lg">
            <Link href={marksHref(g)}>
              {done ? 'View marks' : 'Enter marks'} <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          {/* The supervisor always has the journal one click away - highlighted while weeks wait. */}
          {g.role === 'supervisor' && (
            <Button
              asChild
              size="lg"
              variant="outline"
              className={cn('h-12 text-base', g.journalUnreviewed > 0 && 'border-amber-500/60 text-amber-800 dark:text-amber-300')}
            >
              <Link href={`/capstone/groups/${g._id}`}>
                <PenLine className="mr-2 h-4 w-4" />
                {g.journalUnreviewed > 0 ? `Review ${g.journalUnreviewed} journal ${g.journalUnreviewed === 1 ? 'week' : 'weeks'}` : 'Weekly journal'}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
