'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Settings,
  ArrowRight,
  FileText,
  MessageSquareText,
  ClipboardCheck,
  Users,
  Search,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Archive,
  PenLine,
  List,
  LayoutGrid,
} from 'lucide-react';
import { TeacherShell } from '@/app/components/TeacherShell';
import { Tip } from '@/app/components/Tip';
import { JournalReminderButton } from './components/JournalReminderButton';
import { SessionStatusPill } from './components/SessionStatusPill';
import { isPastSession, isRunning } from '@/lib/capstoneStatus';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// The details drawer loads the first time a student is opened.
const StudentDetailDialog = dynamic(() => import('./components/StudentDetailDialog').then((m) => m.StudentDetailDialog), { ssr: false });

interface MyGroup {
  _id: string;
  track: 'A' | 'B' | 'C';
  groupNumber: number;
  projectTitle: string;
  reportUrl: string | null;
  lastJournalReminderAt: string | null;
  journalCompletedAt: string | null;
  role: 'supervisor' | 'evaluator';
  supervisorName: string | null;
  session: { _id: string; department: string; status: string; semesterName: string | null; journalWeekCount: number } | null;
  members: Array<{ studentAccountId: string; studentId: string; name: string; email: string; journalSubmitted: number }>;
  journalUnreviewed: number;
  /** Group-wide, in student-weeks: the same counts as the group's journal tab. */
  journal?: { toReview: number; reviewed: number; missed: number; notWritten: number; total: number };
  marks: Array<{ component: string; done: number; total: number }>;
}

const COMPONENT_LABEL: Record<string, string> = {
  report: 'Report',
  presentation: 'Presentation',
  peer: 'Peer',
  weeklyJournal: 'Journal',
  poster: 'Poster',
};

/** Where on the group page each component is marked. */
const COMPONENT_TAB: Record<string, string> = {
  report: 'report',
  presentation: 'presentation',
};
const tabFor = (component: string) => COMPONENT_TAB[component] || 'supervisor-marks';

const VIEW_KEY = 'capstone-mygroups-view';

/** "Umme Anisha (233014020)" -> "Umme Anisha": the ID is shown separately. */
const cleanName = (name: string) => name.replace(/\s*\(\d+\)\s*$/, '');
const initials = (name: string) =>
  cleanName(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

export default function CapstonePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'all' | 'supervisor' | 'evaluator'>('all');
  const [period, setPeriod] = useState<'current' | 'past'>('current');
  const [query, setQuery] = useState('');
  const [openStudent, setOpenStudent] = useState<{ groupId: string; studentAccountId: string } | null>(null);
  const [view, setView] = useState<'cards' | 'list'>('list');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // List or cards is a per-person preference, remembered on this device.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'cards') setView(saved);
    } catch {
      /* default view */
    }
  }, []);
  const changeView = (v: 'cards' | 'list') => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered */
    }
  };
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetch('/api/capstone/groups/mine')
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) setGroups(data);
          else toast.error(data.error || 'Failed to load your capstone groups');
        })
        .catch(() => toast.error('Failed to load your capstone groups'))
        .finally(() => setLoading(false));
    }
  }, [status, router]);

  const roles = (session?.user as { roles?: string[] } | undefined)?.roles;
  const canManage = roles?.includes('admin') || roles?.includes('coordinator');

  // A finished semester's groups leave the working view and live under "Past semesters".
  const current = useMemo(() => groups.filter((g) => !isPastSession(g.session?.status)), [groups]);
  const past = useMemo(() => groups.filter((g) => isPastSession(g.session?.status)), [groups]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (period === 'current' ? current : past).filter((g) => {
      if (roleFilter !== 'all' && g.role !== roleFilter) return false;
      if (!q) return true;
      return (
        g.projectTitle.toLowerCase().includes(q) ||
        `#${g.groupNumber}`.includes(q) ||
        (g.supervisorName || '').toLowerCase().includes(q) ||
        g.members.some((m) => m.name.toLowerCase().includes(q) || m.studentId.toLowerCase().includes(q))
      );
    });
  }, [current, past, period, roleFilter, query]);

  // Grouped by session (semester), newest first as the API returns them.
  const bySession = useMemo(() => {
    const map = new Map<string, { key: string; label: string; status: string; groups: MyGroup[] }>();
    for (const g of visible) {
      const key = g.session?._id || 'none';
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: g.session ? `${g.session.department} Capstone${g.session.semesterName ? ` · ${g.session.semesterName}` : ''}` : 'Capstone',
          status: g.session?.status || '',
          groups: [],
        });
      }
      map.get(key)!.groups.push(g);
    }
    return [...map.values()];
  }, [visible]);

  // Only current work counts toward what's owed.
  const totals = useMemo(() => {
    const toReview = current.filter((g) => g.role === 'supervisor').reduce((n, g) => n + g.journalUnreviewed, 0);
    const marksOwed = current
      .filter((g) => isRunning(g.session?.status))
      .reduce((n, g) => n + g.marks.reduce((m, c) => m + (c.total - c.done), 0), 0);
    return { toReview, marksOwed };
  }, [current]);

  return (
    <TeacherShell
      title="Capstone"
      subtitle="Groups you supervise or evaluate"
      actions={
        canManage ? (
          <Tip label="Open, set up and manage capstone sessions for your department">
            <Button asChild variant="outline" size="sm">
              <Link href="/capstone/sessions">
                <Settings className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sessions</span>
              </Link>
            </Button>
          </Tip>
        ) : null
      }
    >
      {loading || status === 'loading' ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
          {/* At-a-glance totals (current semesters only) */}
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryTile icon={Users} label="Current groups" value={current.length} hint="Groups in running semesters where you're the supervisor or an assigned evaluator." />
            <SummaryTile
              icon={MessageSquareText}
              label="Journal entries to review"
              value={totals.toReview}
              hint="Weekly journal weeks your students submitted that you haven't reviewed yet (groups you supervise)."
              tone={totals.toReview > 0 ? 'attention' : 'ok'}
            />
            <SummaryTile
              icon={ClipboardCheck}
              label="Marks still to submit"
              value={totals.marksOwed}
              hint="Student marks you still owe in sessions that are open for marking."
              tone={totals.marksOwed > 0 ? 'attention' : 'ok'}
            />
          </div>

          {groups.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                You are not assigned to any capstone group.
                {canManage && (
                  <div className="mt-4">
                    <Button asChild variant="outline">
                      <Link href="/capstone/sessions">Manage Capstone Sessions</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Semesters">
                  {(
                    [
                      ['current', `Current (${current.length})`],
                      ['past', `Past semesters (${past.length})`],
                    ] as const
                  ).map(([p, label]) => (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={period === p}
                      onClick={() => setPeriod(p)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors',
                        period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {p === 'past' && <Archive className="h-3.5 w-3.5" />}
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Role">
                  {(['all', 'supervisor', 'evaluator'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={roleFilter === r}
                      onClick={() => setRoleFilter(r)}
                      className={cn(
                        'rounded-md px-3 py-1 text-sm transition-colors',
                        roleFilter === r ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {r === 'all' ? 'All roles' : r === 'supervisor' ? 'Supervising' : 'Evaluating'}
                    </button>
                  ))}
                </div>
                <div className="relative min-w-48 flex-1 sm:max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search project, #number, student or ID"
                    className="h-9 pl-8"
                    aria-label="Search groups"
                  />
                </div>
                {period === 'current' && (
                  <div className="ml-auto flex rounded-lg border p-0.5" role="tablist" aria-label="View">
                    {(
                      [
                        ['list', List, 'List'],
                        ['cards', LayoutGrid, 'Cards'],
                      ] as const
                    ).map(([v, Icon, label]) => (
                      <button
                        key={v}
                        type="button"
                        role="tab"
                        aria-selected={view === v}
                        onClick={() => changeView(v)}
                        title={`${label} view`}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm',
                          view === v ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {bySession.length === 0 && (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  {query || roleFilter !== 'all'
                    ? 'No groups match.'
                    : period === 'current'
                      ? 'No groups in a running semester.'
                      : 'No past semesters yet.'}
                  {period === 'current' && !query && past.length > 0 && (
                    <Button variant="link" size="sm" onClick={() => setPeriod('past')}>
                      See past semesters
                    </Button>
                  )}
                </div>
              )}

              {bySession.map((s) => (
                <section key={s.key} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{s.label}</h2>
                    {s.status && <SessionStatusPill status={s.status} />}
                  </div>
                  {period === 'past' ? (
                    <PastGroupList groups={s.groups} />
                  ) : view === 'list' ? (
                    <ul className="divide-y overflow-hidden rounded-lg border">
                      {s.groups.map((g) => (
                        <GroupRow key={g._id} group={g} open={expanded.has(g._id)} onToggle={() => toggleExpanded(g._id)}>
                          <GroupCard
                            group={g}
                            bare
                            onOpenStudent={(studentAccountId) => setOpenStudent({ groupId: g._id, studentAccountId })}
                            onReminderSent={(at) =>
                              setGroups((prev) => prev.map((x) => (x._id === g._id ? { ...x, lastJournalReminderAt: at } : x)))
                            }
                          />
                        </GroupRow>
                      ))}
                    </ul>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {s.groups.map((g) => (
                        <GroupCard
                          key={g._id}
                          group={g}
                          onOpenStudent={(studentAccountId) => setOpenStudent({ groupId: g._id, studentAccountId })}
                          onReminderSent={(at) =>
                            setGroups((prev) => prev.map((x) => (x._id === g._id ? { ...x, lastJournalReminderAt: at } : x)))
                          }
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </>
          )}
        </div>
      )}
      {openStudent && (
        <StudentDetailDialog
          groupId={openStudent.groupId}
          studentAccountId={openStudent.studentAccountId}
          onClose={() => setOpenStudent(null)}
        />
      )}
    </TeacherShell>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: typeof Users;
  label: string;
  value: number;
  hint: string;
  tone?: 'neutral' | 'attention' | 'ok';
}) {
  return (
    <Tip label={hint}>
      <Card className={tone === 'attention' ? 'border-amber-500/40' : undefined}>
        <CardContent className="flex items-center gap-3 p-4">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              tone === 'attention' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary'
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </CardContent>
      </Card>
    </Tip>
  );
}

/** A finished semester: one quiet, read-only row per group. */
function PastGroupList({ groups }: { groups: MyGroup[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-lg border">
      {groups.map((g) => (
        <li key={g._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
          <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
            {g.track} #{g.groupNumber}
          </span>
          <Link href={`/capstone/groups/${g._id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
            {g.projectTitle}
          </Link>
          <span className="text-xs text-muted-foreground">
            {g.role === 'supervisor' ? 'Supervised' : 'Evaluated'} · {g.members.length} students
          </span>
          {g.reportUrl && (
            <a href={g.reportUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
              <FileText className="h-3.5 w-3.5" /> Report
            </a>
          )}
          <Link href={`/capstone/groups/${g._id}`} className="flex items-center text-xs text-muted-foreground hover:text-foreground" aria-label={`View ${g.projectTitle}`}>
            View <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * One thin row per group: what it is, your role, and what's waiting on you. Clicking the
 * row expands the full card in place; the quick action works without expanding.
 */
function GroupRow({ group: g, open, onToggle, children }: { group: MyGroup; open: boolean; onToggle: () => void; children: ReactNode }) {
  const isSupervisor = g.role === 'supervisor';
  const marksDone = g.marks.reduce((n, c) => n + Math.min(c.done, c.total), 0);
  const marksTotal = g.marks.reduce((n, c) => n + c.total, 0);
  return (
    <li className={cn(open && 'bg-muted/20')}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
          <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
            {g.track} #{g.groupNumber}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{g.projectTitle}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {isSupervisor ? 'Supervisor' : `Evaluator${g.supervisorName ? ` · supervised by ${g.supervisorName}` : ''}`} · {g.members.length} students
            </span>
          </span>
          {marksTotal > 0 && (
            <span
              className={cn(
                'hidden shrink-0 items-center gap-1 text-xs sm:flex',
                marksDone >= marksTotal ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              )}
              title="Your marks submitted"
            >
              {marksDone >= marksTotal && <CheckCircle2 className="h-3.5 w-3.5" />} Marks {marksDone}/{marksTotal}
            </span>
          )}
          {g.journalCompletedAt && (
            <span className="hidden shrink-0 items-center gap-1 text-xs text-emerald-600 md:flex dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Journal done
            </span>
          )}
        </button>
        {isSupervisor && g.journalUnreviewed > 0 ? (
          <Button asChild size="sm" className="h-8 shrink-0">
            <Link href={`/capstone/groups/${g._id}`}>
              <PenLine className="mr-1.5 h-3.5 w-3.5" /> Review {g.journalUnreviewed}
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="ghost" className="h-8 shrink-0">
            <Link href={`/capstone/groups/${g._id}`}>
              Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </div>
      {open && <div className="border-t px-4 py-4 sm:pl-12">{children}</div>}
    </li>
  );
}

function GroupCard({
  group: g,
  onOpenStudent,
  onReminderSent,
  bare = false,
}: {
  group: MyGroup;
  onOpenStudent: (studentAccountId: string) => void;
  onReminderSent: (at: string) => void;
  /** Inside an expanded list row: no card frame, and the row already shows the title. */
  bare?: boolean;
}) {
  const weeks = g.session?.journalWeekCount || 0;
  const isSupervisor = g.role === 'supervisor';
  const marksOpen = isRunning(g.session?.status);
  const groupHref = `/capstone/groups/${g._id}`;

  return (
    <Card className={bare ? 'flex flex-col gap-0 border-0 bg-transparent py-0 shadow-none' : 'flex flex-col'}>
      <CardHeader className={bare ? 'hidden' : 'pb-3'}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">Track {g.track} #{g.groupNumber}</Badge>
          <Tip label={isSupervisor ? 'You supervise this group: review journals, and submit every component.' : 'You evaluate this group: submit report and presentation marks.'}>
            <Badge variant={isSupervisor ? 'default' : 'secondary'}>{isSupervisor ? 'Supervisor' : 'Evaluator'}</Badge>
          </Tip>
          {g.journalCompletedAt && (
            <Tip label="Every week is closed and the journal marks are in - the coordinator has been notified.">
              <Badge variant="outline" className="border-emerald-500/50 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Journal done
              </Badge>
            </Tip>
          )}
        </div>
        <CardTitle className="mt-1 text-base leading-snug">
          <Link href={groupHref} className="hover:underline">
            {g.projectTitle}
          </Link>
        </CardTitle>
        {!isSupervisor && g.supervisorName && <p className="text-xs text-muted-foreground">Supervisor: {g.supervisorName}</p>}
      </CardHeader>

      <CardContent className={bare ? 'flex flex-1 flex-col gap-4 px-0' : 'flex flex-1 flex-col gap-4'}>
        {/* What needs doing - every item here is a way into the group, and says where it goes. */}
        {(isSupervisor || g.marks.length > 0) && (
          <div className="space-y-2">
            {isSupervisor && weeks > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <Tip label={`Across all ${g.members.length} students, ${weeks} weeks each - the same counts as the group's Weekly Journal tab.`}>
                  <span className="text-sm">
                    <span className="font-medium">Weekly journal</span>
                    {g.journal && (
                      <span className="text-muted-foreground">
                        {g.journal.toReview > 0 && (
                          <span className="font-medium text-amber-600 dark:text-amber-400"> · {g.journal.toReview} to review</span>
                        )}
                        {' '}· {g.journal.reviewed} reviewed
                        {g.journal.missed > 0 && ` · ${g.journal.missed} missed`}
                        {g.journal.notWritten > 0 && ` · ${g.journal.notWritten} not written`}
                      </span>
                    )}
                  </span>
                </Tip>
                {g.journalUnreviewed > 0 ? (
                  <Button asChild size="sm" className="h-8">
                    <Link href={groupHref}>
                      <PenLine className="mr-1.5 h-3.5 w-3.5" /> Review {g.journalUnreviewed}
                    </Link>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Nothing to review</span>
                )}
              </div>
            )}
            {g.marks.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">Your marks</span>
                {g.marks.map((c) => {
                  const complete = c.total > 0 && c.done >= c.total;
                  return (
                    <Tip
                      key={c.component}
                      label={`${COMPONENT_LABEL[c.component] || c.component}: ${c.done} of ${c.total} students marked${
                        marksOpen ? ' - click to open' : ' (marking is not open right now)'
                      }`}
                    >
                      <Link
                        href={`${groupHref}?tab=${tabFor(c.component)}`}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-muted',
                          complete ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300' : marksOpen ? 'border-amber-500/50' : ''
                        )}
                      >
                        {complete && <CheckCircle2 className="h-3 w-3" />}
                        {COMPONENT_LABEL[c.component] || c.component} {c.done}/{c.total}
                        <ChevronRight className="h-3 w-3 opacity-60" />
                      </Link>
                    </Tip>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Students: each row opens that student's details drawer - and looks like it. */}
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Students · tap for marks, grade and journal</p>
          <ul className="divide-y rounded-lg border">
            {g.members.map((m) => (
              <li key={m.studentAccountId}>
                <button
                  type="button"
                  onClick={() => onOpenStudent(m.studentAccountId)}
                  className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                    {initials(m.name || m.studentId)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{cleanName(m.name) || m.studentId}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{m.studentId}</span>
                  </span>
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground group-hover:text-foreground">
                    Details <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm" variant={isSupervisor && g.journalUnreviewed > 0 ? 'outline' : 'default'}>
            <Link href={groupHref}>
              Open group <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
          {isSupervisor && marksOpen && <JournalReminderButton groupId={g._id} lastSentAt={g.lastJournalReminderAt} onSent={onReminderSent} />}
          {g.reportUrl ? (
            <Button asChild size="sm" variant="ghost">
              <a href={g.reportUrl} target="_blank" rel="noopener noreferrer">
                <FileText className="mr-1.5 h-3.5 w-3.5" /> Report <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </Button>
          ) : (
            <Tip label="The coordinator adds the report link once students submit their final report.">
              <span className="text-xs text-muted-foreground">No report link yet</span>
            </Tip>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
