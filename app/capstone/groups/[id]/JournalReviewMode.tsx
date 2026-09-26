'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, Loader2, Lock, PartyPopper, SkipForward, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { JournalText } from '@/app/capstone/components/JournalText';
import { parseJournal } from '@/lib/journalSections';

export interface ReviewItem {
  entryId: string;
  studentAccountId: string;
  studentName: string;
  studentId: string;
  weekNumber: number;
  workDone: string;
  submittedAt?: string | null;
  /** This student's earlier feedback, newest first - context for consistent comments. */
  previousFeedback: Array<{ weekNumber: number; comment: string }>;
}

/** One-tap replies for the most common feedback. Tapping adds the text; it stays editable. */
export const QUICK_REPLIES = [
  'Good work, keep it up.',
  'Please add more detail about what you completed.',
  'Mention the problems you faced and how you solved them.',
  'Add a clear plan for next week.',
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w && !/^(md|mst|dr)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

/** The first line a reviewer scans in the queue. */
const previewOf = (text: string) => parseJournal(text).answers.worked.replace(/\s+/g, ' ').trim();

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

/**
 * Full-screen, one-entry-at-a-time journal review. The queue is fixed when it opens, so items
 * don't shift while reviewing; each send locks that week and moves to the next.
 */
export function JournalReviewMode({
  open,
  onOpenChange,
  groupId,
  queue,
  onReviewed,
  onFinished,
  finishedHint,
  startEntryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  queue: ReviewItem[];
  /** Called with the API response after each successful review. */
  onReviewed: (response: { entry: unknown; status: unknown }) => void;
  /** A follow-up action for the "all caught up" screen (e.g. go enter journal marks). */
  onFinished?: { label: string; action: () => void };
  finishedHint?: string;
  /** Open at this entry instead of the first (clicking a week tile). */
  startEntryId?: string | null;
}) {
  // Snapshot the queue on open; `done`/`skipped` track progress through it.
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const [openedWith, setOpenedWith] = useState<ReviewItem[] | null>(null);
  if (open && openedWith === null) {
    setOpenedWith(queue);
    setItems(queue);
    setIndex(Math.max(0, queue.findIndex((q) => q.entryId === startEntryId)));
    setDone(new Set());
    setSkipped(new Set());
  }
  if (!open && openedWith !== null) setOpenedWith(null);

  const current = items[index];
  const activeRef = useRef<HTMLButtonElement>(null);

  // The sidebar groups the queue by student, keeping each item's position in `items`.
  const queueGroups = useMemo(() => {
    const groups: Array<{ studentAccountId: string; name: string; items: Array<{ item: ReviewItem; i: number }> }> = [];
    items.forEach((item, i) => {
      let g = groups.find((x) => x.studentAccountId === item.studentAccountId);
      if (!g) {
        g = { studentAccountId: item.studentAccountId, name: item.studentName, items: [] };
        groups.push(g);
      }
      g.items.push({ item, i });
    });
    return groups;
  }, [items]);

  // Keep the current week visible in the sidebar as the queue advances.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  const remaining = useMemo(() => items.filter((i) => !done.has(i.entryId)), [items, done]);
  const allDone = items.length > 0 && remaining.length === 0;
  const onlySkippedLeft = remaining.length > 0 && remaining.every((i) => skipped.has(i.entryId));

  useEffect(() => {
    if (open) textRef.current?.focus();
  }, [open, index]);

  const nextOpenIndex = (from: number, skippedSet = skipped, doneSet = done) => {
    for (let step = 1; step <= items.length; step++) {
      const i = (from + step) % items.length;
      const it = items[i];
      if (!doneSet.has(it.entryId) && !skippedSet.has(it.entryId)) return i;
    }
    // Nothing unskipped left: go back through the skipped ones.
    for (let step = 1; step <= items.length; step++) {
      const i = (from + step) % items.length;
      if (!doneSet.has(items[i].entryId)) return i;
    }
    return from;
  };

  const send = async () => {
    // Ctrl+Enter works anywhere in the screen, including on a week already sent.
    if (!current || sending || done.has(current.entryId)) return;
    setSending(true);
    try {
      const res = await fetch(`/api/capstone/groups/${groupId}/journal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review', entryId: current.entryId, feedback: feedback[current.entryId] || '' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      onReviewed(json);
      const nextDone = new Set(done).add(current.entryId);
      setDone(nextDone);
      toast.success(`Week ${current.weekNumber} closed for ${current.studentName}`);
      if (json.status?.complete) toast.success('Journal complete - the coordinator has been notified');
      if (nextDone.size < items.length) setIndex(nextOpenIndex(index, skipped, nextDone));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const skip = () => {
    if (!current) return;
    const nextSkipped = new Set(skipped).add(current.entryId);
    setSkipped(nextSkipped);
    setIndex(nextOpenIndex(index, nextSkipped));
  };

  const addQuick = (text: string) => {
    if (!current) return;
    setFeedback((f) => {
      const prev = (f[current.entryId] || '').trim();
      return { ...f, [current.entryId]: prev ? `${prev} ${text}` : text };
    });
    textRef.current?.focus();
  };

  const text = current ? feedback[current.entryId] || '' : '';
  const isDone = current ? done.has(current.entryId) : false;

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:h-[92dvh] sm:w-[min(1100px,96vw)] sm:rounded-xl sm:border"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">Review weekly journals</DialogTitle>
            <DialogDescription className="text-xs">
              {allDone ? 'All done' : `${done.size} of ${items.length} reviewed · ${remaining.length} left`}
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} disabled={sending} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${items.length ? (done.size / items.length) * 100 : 0}%` }} />
        </div>

        {allDone || items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <PartyPopper className="h-12 w-12 text-emerald-500" />
            <div>
              <p className="text-xl font-semibold">All caught up!</p>
              <p className="mt-1 text-muted-foreground">
                {items.length ? `You reviewed ${done.size} journal ${done.size === 1 ? 'entry' : 'entries'}.` : 'Nothing is waiting for your review.'}
              </p>
              {finishedHint && <p className="mt-2 text-sm text-muted-foreground">{finishedHint}</p>}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {onFinished && (
                <Button size="lg" onClick={onFinished.action}>
                  {onFinished.label} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              <Button size="lg" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          current && (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              {/* Queue (desktop): grouped by student, current week highlighted */}
              <aside className="hidden w-72 shrink-0 flex-col border-r bg-muted/20 lg:flex">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm font-semibold">Queue</span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    {remaining.length} left
                  </span>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
                  {queueGroups.map((g) => {
                    const doneCount = g.items.filter(({ item }) => done.has(item.entryId)).length;
                    return (
                      <section key={g.studentAccountId}>
                        <div className="mb-1.5 flex items-center gap-2.5 px-1">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                            {initials(g.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold leading-tight">{g.name}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                <span
                                  className="block h-full rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${(doneCount / g.items.length) * 100}%` }}
                                />
                              </span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {doneCount}/{g.items.length}
                              </span>
                            </div>
                          </div>
                        </div>
                        <ul className="space-y-1 border-l-2 border-muted pl-3 ml-5">
                          {g.items.map(({ item, i }) => {
                            const isCurrent = i === index;
                            const isReviewed = done.has(item.entryId);
                            const isSkipped = !isReviewed && skipped.has(item.entryId);
                            return (
                              <li key={item.entryId}>
                                <button
                                  type="button"
                                  ref={isCurrent ? activeRef : undefined}
                                  onClick={() => setIndex(i)}
                                  aria-current={isCurrent ? 'true' : undefined}
                                  className={cn(
                                    'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                                    isCurrent ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/70'
                                  )}
                                >
                                  {isReviewed ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                                  ) : isSkipped ? (
                                    <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                      <span className={cn('h-2.5 w-2.5 rounded-full', isCurrent ? 'bg-primary' : 'bg-amber-500')} />
                                    </span>
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className={cn('flex items-center justify-between gap-2 text-sm', isCurrent ? 'font-semibold' : 'font-medium', isReviewed && 'text-muted-foreground')}>
                                      Week {item.weekNumber}
                                      <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                                        {isReviewed ? 'Done' : isSkipped ? 'Skipped' : isCurrent ? 'Now' : ''}
                                      </span>
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">{previewOf(item.workDone)}</span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </aside>

              {/* The entry */}
              <div className="flex min-h-0 flex-1 flex-col">
                {/* Queue (phones): a scrollable strip of the same items */}
                <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2 lg:hidden">
                  {items.map((it, i) => (
                    <button
                      key={it.entryId}
                      type="button"
                      onClick={() => setIndex(i)}
                      className={cn(
                        'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
                        i === index ? 'border-primary bg-primary text-primary-foreground' : done.has(it.entryId) ? 'text-muted-foreground' : 'bg-background'
                      )}
                    >
                      {done.has(it.entryId) && i !== index && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                      {initials(it.studentName)} · W{it.weekNumber}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
                  <div className="mx-auto max-w-3xl">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary">
                          {initials(current.studentName)}
                        </span>
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-semibold leading-tight sm:text-2xl">{current.studentName}</h2>
                          <p className="text-sm text-muted-foreground">
                            {current.studentId} · submitted {fmt(current.submittedAt)}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border bg-muted/50 px-3 py-1 text-sm font-semibold">Week {current.weekNumber}</span>
                      {isDone && (
                        <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" /> Reviewed
                        </span>
                      )}
                    </div>
                    <div className="mt-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                      <JournalText text={current.workDone} large />
                    </div>
                    {current.previousFeedback.length > 0 && (
                      <details className="mt-4 text-sm">
                        <summary className="cursor-pointer text-muted-foreground">
                          Your earlier feedback to {current.studentName.split(' ')[0]} ({current.previousFeedback.length})
                        </summary>
                        <ul className="mt-2 space-y-1.5">
                          {current.previousFeedback.slice(0, 5).map((f) => (
                            <li key={f.weekNumber} className="rounded-md bg-muted/50 px-3 py-2">
                              <span className="font-medium">Week {f.weekNumber}:</span> {f.comment || 'Acknowledged without comment.'}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>

                {/* Feedback + actions, always visible */}
                <div className="border-t bg-card/60 px-4 py-3 sm:px-8">
                  <div className="mx-auto max-w-3xl space-y-2.5">
                    {!isDone && (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_REPLIES.map((q) => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => addQuick(q)}
                              className="rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:bg-muted"
                            >
                              + {q}
                            </button>
                          ))}
                        </div>
                        <Textarea
                          ref={textRef}
                          rows={3}
                          placeholder={`Feedback for ${current.studentName.split(' ')[0]} (optional)…`}
                          value={text}
                          onChange={(e) => setFeedback((f) => ({ ...f, [current.entryId]: e.target.value }))}
                          className="text-base"
                        />
                      </>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" />
                        {isDone ? 'This week is closed.' : 'Sending is final: the student is emailed and the week locks.'}
                        <span className="hidden sm:inline"> · Ctrl+Enter to send</span>
                      </p>
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => setIndex(Math.max(0, index - 1))}
                        disabled={index === 0 || sending}
                        className="px-3"
                        aria-label="Previous"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      {!isDone && (
                        <Button variant="outline" size="lg" onClick={skip} disabled={sending || remaining.length <= 1}>
                          <SkipForward className="mr-2 h-4 w-4" /> Skip
                        </Button>
                      )}
                      {isDone ? (
                        <Button size="lg" onClick={() => setIndex(nextOpenIndex(index))}>
                          Next <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      ) : (
                        <Button size="lg" onClick={send} disabled={sending} className="min-w-44">
                          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                          {text.trim() ? 'Send feedback & next' : 'Acknowledge & next'}
                        </Button>
                      )}
                    </div>
                    {onlySkippedLeft && (
                      <p className="text-xs text-muted-foreground">Only skipped entries are left - they&apos;ll wait for you next time.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
