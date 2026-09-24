'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
} from 'lucide-react';
import { TeacherShell } from '@/app/components/TeacherShell';
import { Tip } from '@/app/components/Tip';
import { StudentDetailDialog } from './components/StudentDetailDialog';
import { JournalReminderButton } from './components/JournalReminderButton';
import { toast } from 'sonner';

interface MyGroup {
  _id: string;
  track: 'A' | 'B' | 'C';
  groupNumber: number;
  projectTitle: string;
  reportUrl: string | null;
  lastJournalReminderAt: string | null;
  role: 'supervisor' | 'evaluator';
  supervisorName: string | null;
  session: { _id: string; department: string; status: string; semesterName: string | null; journalWeekCount: number } | null;
  members: Array<{ studentAccountId: string; studentId: string; name: string; email: string; journalSubmitted: number }>;
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

const STAGE_HINT: Record<string, string> = {
  draft: 'The session is still being set up - marks cannot be submitted yet.',
  open: 'Marks can be submitted now.',
  grading: 'Mark submission is closed; grades are being computed.',
  closed: 'The semester is finalised.',
};

export default function CapstonePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'all' | 'supervisor' | 'evaluator'>('all');
  const [query, setQuery] = useState('');
  const [openStudent, setOpenStudent] = useState<{ groupId: string; studentAccountId: string } | null>(null);

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (roleFilter !== 'all' && g.role !== roleFilter) return false;
      if (!q) return true;
      return (
        g.projectTitle.toLowerCase().includes(q) ||
        g.members.some((m) => m.name.toLowerCase().includes(q) || m.studentId.toLowerCase().includes(q))
      );
    });
  }, [groups, roleFilter, query]);

  // Grouped by session (semester), newest first as the API returns them.
  const bySession = useMemo(() => {
    const map = new Map<string, { label: string; status: string; groups: MyGroup[] }>();
    for (const g of visible) {
      const key = g.session?._id || 'none';
      if (!map.has(key)) {
        map.set(key, {
          label: g.session ? `${g.session.department} Capstone${g.session.semesterName ? ` · ${g.session.semesterName}` : ''}` : 'Capstone',
          status: g.session?.status || '',
          groups: [],
        });
      }
      map.get(key)!.groups.push(g);
    }
    return [...map.values()];
  }, [visible]);

  const totals = useMemo(() => {
    const toReview = groups.filter((g) => g.role === 'supervisor').reduce((n, g) => n + g.journalUnreviewed, 0);
    const marksOwed = groups
      .filter((g) => g.session?.status === 'open')
      .reduce((n, g) => n + g.marks.reduce((m, c) => m + (c.total - c.done), 0), 0);
    return { toReview, marksOwed };
  }, [groups]);

  const header = (
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
          {/* At-a-glance totals */}
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryTile icon={Users} label="My groups" value={groups.length} hint="Groups where you're the supervisor or an assigned evaluator." />
            <SummaryTile
              icon={MessageSquareText}
              label="Journal entries to review"
              value={totals.toReview}
              hint="Weekly journal entries your students submitted that you haven't commented on yet (supervised groups only)."
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
                You are not currently assigned to any capstone group.
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
                <div className="flex rounded-lg border p-0.5">
                  {(['all', 'supervisor', 'evaluator'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoleFilter(r)}
                      className={`rounded-md px-3 py-1 text-sm transition-colors ${
                        roleFilter === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {r === 'all' ? 'All' : r === 'supervisor' ? 'Supervising' : 'Evaluating'}
                    </button>
                  ))}
                </div>
                <div className="relative min-w-48 flex-1 sm:max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search project, student or ID"
                    className="h-9 pl-8"
                  />
                </div>
              </div>

              {bySession.length === 0 && <p className="text-sm text-muted-foreground">No groups match.</p>}

              {bySession.map((s) => (
                <section key={s.label} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{s.label}</h2>
                    {s.status && (
                      <Tip label={STAGE_HINT[s.status] || s.status}>
                        <Badge variant="secondary" className="capitalize">{s.status}</Badge>
                      </Tip>
                    )}
                  </div>
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
                </section>
              ))}
            </>
          )}
        </div>
      )}
      <StudentDetailDialog
        groupId={openStudent?.groupId || null}
        studentAccountId={openStudent?.studentAccountId || null}
        onClose={() => setOpenStudent(null)}
      />
    </TeacherShell>
  );

  return header;
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

function GroupCard({
  group: g,
  onOpenStudent,
  onReminderSent,
}: {
  group: MyGroup;
  onOpenStudent: (studentAccountId: string) => void;
  onReminderSent: (at: string) => void;
}) {
  const weeks = g.session?.journalWeekCount || 0;
  const isSupervisor = g.role === 'supervisor';
  const marksOpen = g.session?.status === 'open';

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">Track {g.track} #{g.groupNumber}</Badge>
          <Tip label={isSupervisor ? 'You supervise this group: review journals, and submit every component.' : 'You evaluate this group: submit report and presentation marks.'}>
            <Badge variant={isSupervisor ? 'default' : 'secondary'}>{isSupervisor ? 'Supervisor' : 'Evaluator'}</Badge>
          </Tip>
          {isSupervisor && g.journalUnreviewed > 0 && (
            <Tip label="Submitted journal entries you haven't commented on yet. Open the group to review them.">
              <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
                {g.journalUnreviewed} to review
              </Badge>
            </Tip>
          )}
        </div>
        <CardTitle className="mt-1 text-base leading-snug">{g.projectTitle}</CardTitle>
        {!isSupervisor && g.supervisorName && (
          <p className="text-xs text-muted-foreground">Supervisor: {g.supervisorName}</p>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Students - click for their marks, grade and journal. */}
        <div className="divide-y rounded-lg border">
          {g.members.map((m) => {
            const pct = weeks ? Math.min(100, Math.round((m.journalSubmitted / weeks) * 100)) : 0;
            return (
              <Tip key={m.studentAccountId} label="View this student's marks, grade and journal" side="left">
                <button
                  type="button"
                  onClick={() => onOpenStudent(m.studentAccountId)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name || m.studentId}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{m.studentId}</div>
                  </div>
                  {weeks > 0 && (
                    <div className="w-24 shrink-0">
                      <div className="mb-0.5 text-right text-[11px] text-muted-foreground">
                        Journal {m.journalSubmitted}/{weeks}
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </button>
              </Tip>
            );
          })}
        </div>

        {/* Your marks per component. */}
        <div className="flex flex-wrap gap-1.5">
          {g.marks.map((c) => {
            const complete = c.total > 0 && c.done >= c.total;
            return (
              <Tip
                key={c.component}
                label={`Your ${COMPONENT_LABEL[c.component] || c.component} marks: ${c.done} of ${c.total} students submitted${
                  marksOpen ? '' : ' (marking is not open right now)'
                }`}
              >
                <Badge variant="outline" className={complete ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300' : ''}>
                  {complete && <CheckCircle2 className="mr-1 h-3 w-3" />}
                  {COMPONENT_LABEL[c.component] || c.component} {c.done}/{c.total}
                </Badge>
              </Tip>
            );
          })}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Tip label="Open the group to review journals and submit marks">
            <Button asChild size="sm">
              <Link href={`/capstone/groups/${g._id}`}>
                Open group <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </Tip>
          {isSupervisor && (
            <JournalReminderButton groupId={g._id} lastSentAt={g.lastJournalReminderAt} onSent={onReminderSent} />
          )}
          {g.reportUrl ? (
            <Tip label="Open the group's submitted report">
              <Button asChild size="sm" variant="ghost">
                <a href={g.reportUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Report <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </Button>
            </Tip>
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
