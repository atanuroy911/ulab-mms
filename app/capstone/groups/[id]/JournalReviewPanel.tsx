'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCheck,
  CheckCircle2,
  CircleDashed,
  Clock,
  Download,
  Loader2,
  Lock,
  MailCheck,
  MessageSquare,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { JournalText } from '@/app/capstone/components/JournalText';
import { entryState, type GroupJournalStatus, type JournalEntryState } from '@/lib/capstoneJournalStatus';
import { parseJournal } from '@/lib/journalSections';
import dynamic from 'next/dynamic';
import type { ReviewItem } from './JournalReviewMode';
import { clearPageCache, readPageCache, writePageCache } from '@/lib/pageCache';

// The review screens load when first opened.
const JournalReviewMode = dynamic(() => import('./JournalReviewMode').then((m) => m.JournalReviewMode), { ssr: false });
const JournalBulkReview = dynamic(() => import('./JournalBulkReview').then((m) => m.JournalBulkReview), { ssr: false });

/**
 * The page's early journal request, used at most once. Showing the panel again (switching
 * tabs) must not re-apply that first response - it predates every review since, and would
 * put reviewed weeks back to "waiting" on screen.
 */
const usedPrefetches = new WeakSet<object>();

/** Every week closed but journal marks still missing - the step after reviewing. */
function weeksAllClosedAfter(data: { status: GroupJournalStatus | null } | null, memberCount: number) {
  const st = data?.status;
  return !!st && st.weeksTotal > 0 && st.weeksClosed === st.weeksTotal && st.marksRequired && st.marksIn < memberCount;
}

interface Entry {
  _id: string;
  studentAccountId: string;
  weekNumber: number;
  workDone: string;
  submittedAt?: string | null;
  supervisorComment?: string;
  supervisorReviewedAt?: string | null;
  reopenedAt?: string | null;
  updatedAt?: string;
}

interface Member {
  studentAccountId: { _id: string; studentId: string; name: string } | string;
  studentIdText: string;
  removedAt?: string | null;
}

interface JournalPayload {
  group: { members: Member[]; journalCompletedAt?: string | null };
  entries: Entry[];
  status: GroupJournalStatus | null;
  journalWeekCount: number;
  sessionStatus?: string;
  canReopen: boolean;
}

const STATE_META: Record<JournalEntryState, { label: string; icon: typeof Clock; text: string; tile: string }> = {
  'not-started': {
    label: 'Not written',
    icon: CircleDashed,
    text: 'text-muted-foreground',
    tile: 'border-dashed text-muted-foreground hover:bg-muted/50',
  },
  submitted: {
    label: 'Waiting for review',
    icon: Clock,
    text: 'text-amber-600 dark:text-amber-400',
    tile: 'border-amber-500/60 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200',
  },
  reviewed: {
    label: 'Reviewed',
    icon: CheckCircle2,
    text: 'text-emerald-600 dark:text-emerald-400',
    tile: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200',
  },
  missed: {
    label: 'Closed · not submitted',
    icon: XCircle,
    text: 'text-rose-600 dark:text-rose-400',
    tile: 'border-rose-500/40 bg-rose-500/10 text-rose-800 hover:bg-rose-500/20 dark:text-rose-200',
  },
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

const idOf = (m: Member) => (typeof m.studentAccountId === 'object' ? m.studentAccountId._id : m.studentAccountId);
const nameOf = (m: Member) => (typeof m.studentAccountId === 'object' ? m.studentAccountId.name : m.studentIdText);

/** A week opened from the grid that isn't waiting for review (those open review mode). */
interface OpenWeek {
  studentAccountId: string;
  studentName: string;
  weekNumber: number;
  entry: Entry | null;
}

/**
 * The supervisor's view of the weekly journal: where every student stands, week by week, at a
 * glance. Reading and giving feedback happens in the review modal (one at a time) or bulk
 * review (many at once); a week tile opens the entry. Coordinators can also reopen a week.
 */
export function JournalReviewPanel({
  groupId,
  canReview,
  initialData,
  onStatus,
  onGoToMarks,
}: {
  groupId: string;
  /** The group's supervisor, or a coordinator/admin acting for them. */
  canReview: boolean;
  /** A request the page started early, so the journal loads alongside the page. */
  initialData?: Promise<JournalPayload | null> | null;
  /** Progress for the page's student list, whenever it changes. */
  onStatus?: (status: GroupJournalStatus | null) => void;
  /** Opens the tab where the supervisor enters journal marks. */
  onGoToMarks?: () => void;
}) {
  const [data, setData] = useState<JournalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewStart, setReviewStart] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [openWeek, setOpenWeek] = useState<OpenWeek | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Only once the data is here: the review queue is taken at the moment it opens.
  const reviewOpen = !!data && reviewing;
  // Students get one feedback email for the whole sitting, sent when the review screen
  // closes (and as a catch-up when the journal is opened) - never one per week.
  const sendOwedFeedback = useCallback(() => {
    fetch(`/api/capstone/groups/${groupId}/journal`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'notify' }),
    }).catch(() => undefined);
  }, [groupId]);

  const setReviewOpen = (open: boolean) => {
    setReviewing(open);
    if (!open) {
      setReviewStart(null);
      sendOwedFeedback();
    }
  };

  const apply = useCallback(
    (next: JournalPayload) => {
      setData(next);
      onStatus?.(next.status);
      writePageCache(`capstone-journal:${groupId}`, next);
    },
    [onStatus, groupId]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/capstone/groups/${groupId}/journal`);
      const json = await res.json();
      if (res.status === 403 || res.status === 404) {
        // Access removed (or group deleted): don't keep showing what this tab cached earlier.
        clearPageCache(`capstone-journal:${groupId}`);
        setData(null);
      }
      if (!res.ok) throw new Error(json.error || 'Failed to load journals');
      apply(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load journals');
    } finally {
      setLoading(false);
    }
  }, [groupId, apply]);

  // First load: use the page's early request when there is one. Deliberately once per group -
  // later refreshes come from the actions below.
  useEffect(() => {
    let cancelled = false;
    // What this tab last saw, straight away; the request below replaces it.
    const cached = readPageCache<JournalPayload>(`capstone-journal:${groupId}`);
    if (cached) {
      setData(cached);
      onStatus?.(cached.status);
      setLoading(false);
    }
    (async () => {
      let early: JournalPayload | null = null;
      if (initialData && !usedPrefetches.has(initialData)) {
        usedPrefetches.add(initialData);
        early = await initialData;
      }
      if (cancelled) return;
      if (early) {
        apply(early);
        setLoading(false);
      } else {
        await load();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Catch-up: feedback owed from a review screen that was never closed properly.
  useEffect(() => {
    if (canReview) sendOwedFeedback();
  }, [canReview, sendOwedFeedback]);

  const members = useMemo(() => (data?.group.members || []).filter((m) => !m.removedAt), [data]);
  const statusById = useMemo(() => new Map((data?.status?.members || []).map((m) => [m.studentAccountId, m])), [data]);

  // Linked from the "journal submitted" email (?student=...), else the first student with
  // something waiting, else the first student.
  const linked = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('student') : null;
  const current =
    selected ??
    (linked && members.some((m) => idOf(m) === linked) ? linked : null) ??
    ((w) => (w ? idOf(w) : null))(members.find((m) => (statusById.get(idOf(m))?.awaiting || 0) > 0)) ??
    (members[0] ? idOf(members[0]) : null);
  // Once picked automatically, stay on that student: otherwise reviewing their last waiting
  // week would make the view jump to whoever has something waiting next.
  if (selected === null && data && current) setSelected(current);

  /**
   * Apply review/close responses in place instead of reloading everything. Returns false when
   * it can't (a reopen, or no fresh status) so the caller re-fetches instead.
   */
  const applyResponse = (json: {
    entry?: Entry & { studentAccountId: unknown };
    entries?: Array<Entry & { studentAccountId: unknown }>;
    status?: GroupJournalStatus | null;
  }) => {
    const changed = json.entries || (json.entry ? [json.entry] : []);
    if (!changed.length || !json.status) return false;
    const saved = changed.map((e) => ({ ...e, studentAccountId: String(e.studentAccountId) }));
    const status = json.status;
    setData((prev) => {
      if (!prev) return prev;
      const key = (e: Entry) => `${e.studentAccountId}:${e.weekNumber}`;
      const replaced = new Set(saved.map(key));
      const ids = new Set(saved.map((e) => e._id));
      const next = {
        ...prev,
        entries: [...prev.entries.filter((e) => !ids.has(e._id) && !replaced.has(key(e))), ...saved],
        status,
        group: { ...prev.group, journalCompletedAt: status.complete ? prev.group.journalCompletedAt || new Date().toISOString() : null },
      };
      writePageCache(`capstone-journal:${groupId}`, next);
      return next;
    });
    onStatus?.(status);
    return true;
  };

  // Close a never-written week, or (coordinator) reopen a closed one - from the entry dialog.
  const actOnWeek = async (kind: 'missed' | 'reopen') => {
    if (!openWeek) return;
    setBusy(true);
    try {
      const body =
        kind === 'missed'
          ? { action: 'missed', studentAccountId: openWeek.studentAccountId, weekNumber: openWeek.weekNumber, feedback: note }
          : { action: 'reopen', entryId: openWeek.entry?._id };
      const res = await fetch(`/api/capstone/groups/${groupId}/journal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      toast.success(
        kind === 'missed'
          ? `Week ${openWeek.weekNumber} closed as not submitted`
          : `Week ${openWeek.weekNumber} reopened for ${openWeek.studentName}`
      );
      if (json.status?.complete && !data?.status?.complete) toast.success('Journal complete - the coordinator has been notified');
      setOpenWeek(null);
      setNote('');
      if (!applyResponse(json)) await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/capstone/groups/${groupId}/journal/export`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `journal-${groupId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Everything waiting for review, student by student, oldest week first.
  const reviewQueue: ReviewItem[] = useMemo(() => (data ? members : []).flatMap((m) => {
    const sid = idOf(m);
    const mine = data!.entries.filter((e) => e.studentAccountId === sid);
    const previousFeedback = mine
      .filter((e) => entryState(e) === 'reviewed')
      .sort((x, y) => y.weekNumber - x.weekNumber)
      .map((e) => ({ weekNumber: e.weekNumber, comment: e.supervisorComment || '' }));
    return mine
      .filter((e) => entryState(e) === 'submitted' && e.weekNumber <= (data?.journalWeekCount || 0))
      .sort((x, y) => x.weekNumber - y.weekNumber)
      .map((e) => ({
        entryId: e._id,
        studentAccountId: sid,
        studentName: nameOf(m),
        studentId: m.studentIdText,
        weekNumber: e.weekNumber,
        workDone: e.workDone,
        submittedAt: e.submittedAt,
        previousFeedback: previousFeedback.filter((f) => f.weekNumber < e.weekNumber),
      }));
  }), [data, members]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const status = data.status;
  const weekCount = data.journalWeekCount;
  const locked = data.sessionStatus === 'closed' || data.sessionStatus === 'draft';
  const reviewAllowed = canReview && !locked;
  const pct = status && status.weeksTotal ? Math.round((status.weeksClosed / status.weeksTotal) * 100) : 0;
  const currentMember = members.find((m) => idOf(m) === current);
  const currentStatus = current ? statusById.get(current) : undefined;
  const entriesByWeek = new Map(data.entries.filter((e) => e.studentAccountId === current).map((e) => [e.weekNumber, e]));
  const openWeekState = openWeek ? entryState(openWeek.entry) : 'not-started';

  const openTile = (week: number) => {
    if (!current || !currentMember) return;
    const entry = entriesByWeek.get(week) || null;
    if (entryState(entry) === 'submitted' && reviewAllowed && entry) {
      setReviewStart(entry._id);
      setReviewing(true);
      return;
    }
    setNote('');
    setOpenWeek({ studentAccountId: current, studentName: nameOf(currentMember), weekNumber: week, entry });
  };

  return (
    <div className="space-y-4">
      {/* Where the group stands, and the two ways to review */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                {status?.complete ? (
                  <p className="flex items-center gap-2 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                    <MailCheck className="h-5 w-5 shrink-0" /> Journal complete
                  </p>
                ) : (
                  <p className="text-lg font-semibold">
                    {status?.weeksClosed ?? 0} of {status?.weeksTotal ?? 0} student-weeks closed
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  onClick={exportCsv}
                  disabled={exporting}
                  aria-label="Download all journals as CSV"
                  title="Download all journals as CSV"
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {status?.complete && data.group.journalCompletedAt
                  ? `Coordinator notified ${fmtDate(data.group.journalCompletedAt)}.`
                  : status && status.awaitingReview > 0
                    ? `${status.awaitingReview} waiting for your review.`
                    : 'Nothing waiting for review right now.'}
                {status?.marksRequired && ` Journal marks: ${status.marksIn} of ${members.length} entered.`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 empty:hidden">
              {reviewAllowed && reviewQueue.length > 0 && (
                <>
                  <Button size="lg" onClick={() => setReviewing(true)}>
                    <MessageSquare className="mr-2 h-4 w-4" /> Review one by one ({reviewQueue.length})
                  </Button>
                  {reviewQueue.length > 1 && (
                    <Button size="lg" variant="outline" onClick={() => setBulkOpen(true)}>
                      <CheckCheck className="mr-2 h-4 w-4" /> Bulk review
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full transition-all', status?.complete ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
          </div>
          {weeksAllClosedAfter(data, members.length) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                Every week is closed. Enter the weekly journal marks to finish and notify the coordinator.
              </span>
              {onGoToMarks && (
                <Button size="sm" onClick={onGoToMarks}>
                  Enter marks
                </Button>
              )}
            </div>
          )}
          {locked && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> The session is {data.sessionStatus}, so journals are read-only.
            </p>
          )}
        </CardContent>
      </Card>

      {members.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">This group has no active members.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Students */}
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {members.map((m) => {
              const id = idOf(m);
              const st = statusById.get(id);
              const done = st ? st.reviewed + st.missed : 0;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelected(id)}
                  className={cn(
                    'min-w-48 shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors lg:min-w-0',
                    id === current ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{nameOf(m)}</span>
                    {st && st.awaiting > 0 ? (
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                        {st.awaiting}
                      </span>
                    ) : st?.closed ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    ) : null}
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${weekCount ? (done / weekCount) * 100 : 0}%` }} />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {done}/{weekCount} closed{st?.mark !== null && st?.mark !== undefined ? ` · mark ${st.mark}` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* The selected student's weeks, as tiles */}
          <Card className="min-w-0">
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold">{currentMember ? nameOf(currentMember) : ''}</h3>
                  <p className="text-sm text-muted-foreground">
                    {currentStatus
                      ? `${currentStatus.reviewed} reviewed · ${currentStatus.awaiting} waiting · ${currentStatus.notStarted} not written${currentStatus.missed ? ` · ${currentStatus.missed} missed` : ''}`
                      : ''}
                  </p>
                </div>
                {reviewAllowed && currentStatus && currentStatus.awaiting > 0 && (
                  <Button
                    onClick={() => {
                      const first = reviewQueue.find((q) => q.studentAccountId === current);
                      setReviewStart(first?.entryId || null);
                      setReviewing(true);
                    }}
                  >
                    Review {currentStatus.awaiting} {currentStatus.awaiting === 1 ? 'week' : 'weeks'}
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: weekCount }, (_, i) => i + 1).map((week) => {
                  const entry = entriesByWeek.get(week) || null;
                  const state = entryState(entry);
                  const meta = STATE_META[state];
                  const Icon = meta.icon;
                  const line = entry?.workDone ? parseJournal(entry.workDone).answers.worked.replace(/\s+/g, ' ') : '';
                  return (
                    <button
                      key={week}
                      type="button"
                      onClick={() => openTile(week)}
                      className={cn('flex min-h-24 flex-col rounded-xl border p-3 text-left transition-colors', meta.tile)}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold">Week {week}</span>
                        <Icon className="h-4 w-4 shrink-0" />
                      </span>
                      <span className="mt-0.5 text-[11px] font-medium opacity-80">{meta.label}</span>
                      {line && <span className="mt-1.5 line-clamp-2 text-xs text-foreground/80">{line}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Tap a week to open it. Waiting weeks open in the review screen.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {reviewOpen && (
        <JournalReviewMode
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          groupId={groupId}
          queue={reviewQueue}
          startEntryId={reviewStart}
          onReviewed={(json) => applyResponse(json as Parameters<typeof applyResponse>[0])}
          finishedHint={
            weeksAllClosedAfter(data, members.length) ? 'Every week is closed. Enter the weekly journal marks to finish and notify the coordinator.' : undefined
          }
          onFinished={
            onGoToMarks && weeksAllClosedAfter(data, members.length)
              ? {
                  label: 'Enter journal marks',
                  action: () => {
                    setReviewOpen(false);
                    onGoToMarks();
                  },
                }
              : undefined
          }
        />
      )}

      {bulkOpen && (
        <JournalBulkReview
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          groupId={groupId}
          queue={reviewQueue}
          onDone={(json) => {
            applyResponse(json as Parameters<typeof applyResponse>[0]);
            // Then settle on the server's truth, quietly - the screen must never drift from it.
            load();
          }}
        />
      )}

      {/* One week that isn't waiting for review: read it, close it, or reopen it. */}
      <Dialog open={openWeek !== null} onOpenChange={(o) => !o && !busy && setOpenWeek(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {openWeek?.studentName} · Week {openWeek?.weekNumber}
            </DialogTitle>
            <DialogDescription className={cn('flex items-center gap-1.5 font-medium', STATE_META[openWeekState].text)}>
              {STATE_META[openWeekState].label}
              {openWeek?.entry?.submittedAt && (
                <span className="font-normal text-muted-foreground">· submitted {fmtDate(openWeek.entry.submittedAt)}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55dvh] space-y-3 overflow-y-auto">
            {openWeek?.entry?.workDone ? (
              <div className="rounded-xl border p-4">
                <JournalText text={openWeek.entry.workDone} />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                {openWeekState === 'missed' ? 'Closed without a submission.' : "The student hasn't written this week yet."}
              </p>
            )}
            {(openWeekState === 'reviewed' || openWeekState === 'missed') && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-primary">Feedback · closed {fmtDate(openWeek?.entry?.supervisorReviewedAt)}</p>
                <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
                  {openWeek?.entry?.supervisorComment?.trim() || (openWeekState === 'reviewed' ? 'Acknowledged without comment.' : 'No note.')}
                </p>
              </div>
            )}
            {openWeekState === 'not-started' && reviewAllowed && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  If the student won&apos;t be writing this week, close it as <strong>not submitted</strong> so the group can finish. They&apos;ll be emailed and can&apos;t write it afterwards.
                </p>
                <Textarea rows={2} placeholder="Note for the student (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpenWeek(null)} disabled={busy}>
              Close
            </Button>
            {openWeekState === 'not-started' && reviewAllowed && (
              <Button variant="destructive" onClick={() => actOnWeek('missed')} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Close as not submitted
              </Button>
            )}
            {(openWeekState === 'reviewed' || openWeekState === 'missed') && data.canReopen && !locked && (
              <Button variant="outline" onClick={() => actOnWeek('reopen')} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Reopen for the student
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
