'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  ArrowLeft,
  Pencil,
  CheckCircle2,
  Clock,
  Lock,
  MessageSquare,
  Plus,
  XCircle,
  Users,
  UserRound,
  PenLine,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '@/app/components/AppHeader';
import { cn } from '@/lib/utils';
import { entryState, type JournalEntryState } from '@/lib/capstoneJournalStatus';
import { isPastSession, isRunning, statusLabel } from '@/lib/capstoneStatus';
import { JournalText } from '@/app/capstone/components/JournalText';
import { CapstoneGuide } from '@/app/capstone/components/CapstoneGuide';
import dynamic from 'next/dynamic';
import type { WizardTarget } from './JournalWizard';

// The writing form loads when a student first opens it.
const JournalWizard = dynamic(() => import('./JournalWizard').then((m) => m.JournalWizard), { ssr: false });

interface Member {
  _id: string;
  studentAccountId: { _id: string; studentId: string; name: string } | string;
  studentIdText: string;
  removedAt?: string | null;
}

interface Group {
  _id: string;
  track: 'A' | 'B' | 'C';
  groupNumber: number;
  projectTitle: string;
  members: Member[];
  supervisorId: { _id: string; name: string; email: string };
}

interface CapstoneSessionInfo {
  _id: string;
  department: string;
  status: 'draft' | 'open' | 'grading' | 'closed';
  journalWeekCount: number;
}

interface JournalEntry {
  _id: string;
  weekNumber: number;
  workDone: string;
  submittedAt?: string | null;
  supervisorComment?: string;
  supervisorReviewedAt?: string | null;
}

interface CapstoneResult {
  group: Group;
  session: CapstoneSessionInfo;
  journalEntries: JournalEntry[];
}

const STATE_META: Record<Exclude<JournalEntryState, 'not-started'>, { label: string; icon: typeof Clock; chip: string }> = {
  submitted: { label: 'Waiting for review', icon: Clock, chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  reviewed: { label: 'Reviewed', icon: CheckCircle2, chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  missed: { label: 'Closed · not submitted', icon: XCircle, chip: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
};

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

export default function StudentCapstonePage() {
  const [results, setResults] = useState<CapstoneResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState<WizardTarget | null>(null);
  const [showTitleEdit, setShowTitleEdit] = useState<Group | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/student/capstone');
      const data = await res.json();
      if (res.ok) setResults(data);
      else toast.error(data.error || 'Failed to load capstone info');
    } catch {
      toast.error('Failed to load capstone info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const saveTitle = async () => {
    if (!showTitleEdit) return;
    setSavingTitle(true);
    try {
      const res = await fetch('/api/student/capstone/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: showTitleEdit._id, projectTitle: titleInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update title');
      toast.success('Project title updated');
      setShowTitleEdit(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update title');
    } finally {
      setSavingTitle(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="Capstone"
        subtitle="Your group and weekly journal"
        logoHref="/student/dashboard"
        beforeTheme={<CapstoneGuide audience="student" />}
        actions={[{ key: 'back', label: 'Back', icon: ArrowLeft, href: '/student/dashboard', variant: 'outline', alwaysShowLabel: true }]}
      />

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-6 sm:py-8">
        {results.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-lg font-medium">You&apos;re not in a capstone group yet</p>
              <p className="mt-1 text-muted-foreground">Once your coordinator adds you to a group, your weekly journal appears here.</p>
            </CardContent>
          </Card>
        )}

        {results
          .filter((r) => !isPastSession(r.session?.status))
          .map(({ group, session, journalEntries }) => (
            <GroupJournal
              key={group._id}
              group={group}
              session={session}
              entries={journalEntries}
              onWrite={(target) => setWizard(target)}
              onEditTitle={() => {
                setTitleInput(group.projectTitle);
                setShowTitleEdit(group);
              }}
            />
          ))}

        {/* Finished semesters: kept for reference, out of the way. */}
        {results.some((r) => isPastSession(r.session?.status)) && (
          <details className="group rounded-xl border p-4" open={results.every((r) => isPastSession(r.session?.status))}>
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-4 w-4 -rotate-90 transition-transform group-open:rotate-0" />
              Past capstone ({results.filter((r) => isPastSession(r.session?.status)).length})
            </summary>
            <div className="mt-6 space-y-10">
              {results
                .filter((r) => isPastSession(r.session?.status))
                .map(({ group, session, journalEntries }) => (
                  <GroupJournal
                    key={group._id}
                    group={group}
                    session={session}
                    entries={journalEntries}
                    onWrite={() => {}}
                    onEditTitle={() => {}}
                  />
                ))}
            </div>
          </details>
        )}
      </main>

      {wizard && (
        <JournalWizard
          target={wizard}
          onClose={() => setWizard(null)}
          onSaved={() => {
            setWizard(null);
            fetchData();
          }}
        />
      )}

      <Dialog open={showTitleEdit !== null} onOpenChange={(open) => !open && !savingTitle && setShowTitleEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit project title</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="project-title">Project title</Label>
            <Input id="project-title" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowTitleEdit(null)} disabled={savingTitle}>
              Cancel
            </Button>
            <Button onClick={saveTitle} disabled={savingTitle || !titleInput.trim()}>
              {savingTitle && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupJournal({
  group,
  session,
  entries,
  onWrite,
  onEditTitle,
}: {
  group: Group;
  session: CapstoneSessionInfo;
  entries: JournalEntry[];
  onWrite: (target: WizardTarget) => void;
  onEditTitle: () => void;
}) {
  const total = session.journalWeekCount;
  const isOpen = isRunning(session.status);
  const inRange = entries.filter((e) => e.weekNumber <= total);
  const written = inRange.filter((e) => entryState(e) !== 'not-started');
  const byWeek = new Map(inRange.map((e) => [e.weekNumber, e]));
  const unwritten = Array.from({ length: total }, (_, i) => i + 1).filter((w) => entryState(byWeek.get(w)) === 'not-started');
  const nextWeek = unwritten[0];
  const reviewed = written.filter((e) => entryState(e) === 'reviewed').length;
  const waiting = written.filter((e) => entryState(e) === 'submitted').length;
  const missed = written.filter((e) => entryState(e) === 'missed').length;
  const activeMembers = group.members.filter((m) => !m.removedAt);
  const newestFirst = [...written].sort((a, b) => b.weekNumber - a.weekNumber);

  const startNew = () =>
    nextWeek &&
    onWrite({ groupId: group._id, week: nextWeek, weekChoices: unwritten, existingText: null, totalWeeks: total });

  return (
    <section className="space-y-5">
      {/* Project */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">Capstone {group.track}</Badge>
                <Badge variant="outline">Group {group.groupNumber}</Badge>
                <Badge variant="secondary">{statusLabel(session.status)}</Badge>
              </div>
              <h2 className="text-lg font-semibold leading-snug wrap-break-word">{group.projectTitle || 'Untitled project'}</h2>
            </div>
            {group.track === 'A' && isOpen && (
              <Button variant="outline" size="sm" onClick={onEditTitle} className="self-start">
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit title
              </Button>
            )}
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex min-w-0 items-start gap-2">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Supervisor</p>
                <p className="truncate font-medium">{group.supervisorId?.name || '—'}</p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Members ({activeMembers.length})</p>
                <p>{activeMembers.map((m) => (typeof m.studentAccountId === 'object' ? m.studentAccountId.name : m.studentIdText)).join(', ')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* The one thing to do */}
      <div className="rounded-2xl border bg-linear-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Weekly journal</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {written.length} <span className="text-lg font-medium text-muted-foreground">of {total} weeks written</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {reviewed} reviewed{waiting ? ` · ${waiting} waiting for review` : ''}
              {missed ? ` · ${missed} missed` : ''}
            </p>
          </div>
          {isOpen && nextWeek ? (
            <Button size="lg" onClick={startNew} className="h-14 w-full px-6 text-base sm:w-auto">
              <Plus className="mr-2 h-5 w-5" /> Add journal entry
              <span className="ml-2 rounded-md bg-primary-foreground/20 px-2 py-0.5 text-sm">Week {nextWeek}</span>
            </Button>
          ) : isOpen ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" /> Every week is written
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              {session.status === 'draft' ? 'The journal opens when your coordinator starts the session.' : 'Journal writing is closed.'}
            </p>
          )}
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-background/60">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (written.length / total) * 100 : 0}%` }} />
        </div>
      </div>

      {/* How it works - three plain steps */}
      <ol className="grid gap-2 sm:grid-cols-3">
        {[
          { icon: PenLine, title: 'Write your week', text: 'Answer a few short questions about what you did.' },
          { icon: MessageSquare, title: 'Supervisor reviews', text: 'You get their feedback by email and here.' },
          { icon: Lock, title: 'Week is closed', text: 'After feedback the week is locked - no more edits.' },
        ].map((s, i) => (
          <li key={s.title} className="flex items-start gap-3 rounded-xl border p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{i + 1}</span>
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <s.icon className="h-4 w-4 text-muted-foreground" /> {s.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* Entries */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Your entries</h3>
        {newestFirst.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">No entries yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first journal entry - it only takes a few minutes.</p>
            {isOpen && nextWeek && (
              <Button size="lg" className="mt-4" onClick={startNew}>
                <Plus className="mr-2 h-5 w-5" /> Write Week {nextWeek}
              </Button>
            )}
          </div>
        ) : (
          newestFirst.map((entry) => (
            <EntryCard
              key={entry._id}
              entry={entry}
              total={total}
              supervisorName={group.supervisorId?.name}
              canEdit={isOpen && entryState(entry) === 'submitted'}
              onEdit={() =>
                onWrite({ groupId: group._id, week: entry.weekNumber, weekChoices: [], existingText: entry.workDone, totalWeeks: total })
              }
            />
          ))
        )}
        {isOpen && unwritten.length > 1 && newestFirst.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            {unwritten.length} weeks left to write. Missed one? Pick any week when you add an entry.
          </p>
        )}
      </div>
    </section>
  );
}

function EntryCard({
  entry,
  total,
  supervisorName,
  canEdit,
  onEdit,
}: {
  entry: JournalEntry;
  total: number;
  supervisorName?: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const state = entryState(entry) as Exclude<JournalEntryState, 'not-started'>;
  const meta = STATE_META[state];
  const [expanded, setExpanded] = useState(false);
  const long = entry.workDone.length > 400;

  return (
    <Card className={cn(state === 'submitted' && 'border-amber-500/40')}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">Week {entry.weekNumber}</span>
            <span className="text-xs text-muted-foreground">of {total}</span>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', meta.chip)}>
              <meta.icon className="h-3.5 w-3.5" /> {meta.label}
            </span>
          </div>
          {entry.submittedAt && <span className="text-xs text-muted-foreground">Submitted {fmtDate(entry.submittedAt)}</span>}
        </div>

        {entry.workDone ? (
          <div className="relative">
            <div className={cn(!expanded && long && 'max-h-40 overflow-hidden')}>
              <JournalText text={entry.workDone} />
            </div>
            {long && !expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-card to-transparent" />}
            {long && (
              <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 flex items-center gap-1 text-sm font-medium text-primary">
                {expanded ? 'Show less' : 'Read all'} <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing was written for this week.</p>
        )}

        {(state === 'reviewed' || state === 'missed') && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <MessageSquare className="h-3.5 w-3.5" />
              {supervisorName ? `Feedback from ${supervisorName}` : 'Supervisor feedback'}
              {entry.supervisorReviewedAt && <span className="font-normal text-muted-foreground">· {fmtDate(entry.supervisorReviewedAt)}</span>}
            </p>
            <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
              {entry.supervisorComment?.trim() || (state === 'reviewed' ? 'Reviewed - no comment.' : 'Closed as not submitted.')}
            </p>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">You can edit this until your supervisor reviews it.</p>
            <Button variant="outline" size="lg" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Edit entry
            </Button>
          </div>
        )}
        {(state === 'reviewed' || state === 'missed') && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Closed
          </p>
        )}
      </CardContent>
    </Card>
  );
}
