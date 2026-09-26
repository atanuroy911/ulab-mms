'use client';

import { useMemo, useState } from 'react';
import { CheckCheck, ChevronDown, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { parseJournal } from '@/lib/journalSections';
import { JournalText } from '@/app/capstone/components/JournalText';
import { QUICK_REPLIES, type ReviewItem } from './JournalReviewMode';

/** First line a supervisor would scan: the "worked on" answer, or the start of free text. */
const preview = (text: string) => parseJournal(text).answers.worked.replace(/\s+/g, ' ').trim();

/**
 * Review many waiting entries at once with one shared feedback (or a plain acknowledgement) -
 * for catching up after a few weeks. Every entry is still reviewed individually on the
 * server, so each student gets their own email and each week locks on its own.
 */
export function JournalBulkReview({
  open,
  onOpenChange,
  groupId,
  queue,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  queue: ReviewItem[];
  onDone: (response: { entries: unknown[]; skipped: number; status: unknown }) => void;
}) {
  // This mounts only while open, so everything starts selected on each opening. Taken once:
  // the parent re-renders (and rebuilds `queue`) whenever anything on the page refreshes,
  // which must not wipe the supervisor's ticks.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(queue.map((q) => q.entryId)));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);

  const byStudent = useMemo(() => {
    const groups = new Map<string, { name: string; studentId: string; items: ReviewItem[] }>();
    for (const item of queue) {
      if (!groups.has(item.studentAccountId)) groups.set(item.studentAccountId, { name: item.studentName, studentId: item.studentId, items: [] });
      groups.get(item.studentAccountId)!.items.push(item);
    }
    return [...groups.entries()];
  }, [queue]);

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const allOn = queue.length > 0 && selected.size === queue.length;
  const count = selected.size;

  const send = async () => {
    if (!count) return;
    setSending(true);
    try {
      const res = await fetch(`/api/capstone/groups/${groupId}/journal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reviewMany', entryIds: [...selected], feedback }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      onDone(json);
      toast.success(`${json.entries.length} ${json.entries.length === 1 ? 'week' : 'weeks'} reviewed - students emailed`);
      if (json.skipped) toast.info(`${json.skipped} ${json.skipped === 1 ? 'was' : 'were'} already reviewed and left as they were`);
      if (json.status?.complete) toast.success('Journal complete - the coordinator has been notified');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="flex h-[min(90dvh,860px)] flex-col gap-0 p-0 sm:max-w-3xl">
        <div className="border-b px-5 pt-5 pb-4 pr-12">
          <DialogTitle className="text-lg">Bulk review</DialogTitle>
          <DialogDescription>
            Tick the weeks to close, write one feedback for all of them (or leave it empty to just acknowledge), and send.
          </DialogDescription>
          <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox checked={allOn} onCheckedChange={(v) => toggle(queue.map((q) => q.entryId), !!v)} />
            Select all ({queue.length})
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {queue.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">Nothing is waiting for review.</p>
          ) : (
            byStudent.map(([sid, g]) => {
              const ids = g.items.map((i) => i.entryId);
              const on = ids.filter((id) => selected.has(id)).length;
              return (
                <section key={sid} className="mb-4">
                  <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-2 bg-background py-1.5">
                    <Checkbox checked={on === ids.length ? true : on ? 'indeterminate' : false} onCheckedChange={(v) => toggle(ids, !!v)} />
                    <span className="font-semibold">{g.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {g.studentId} · {on}/{ids.length} selected
                    </span>
                  </label>
                  <ul className="space-y-1.5 pl-6">
                    {g.items.map((item) => {
                      const open = expanded === item.entryId;
                      return (
                        <li key={item.entryId} className={cn('rounded-lg border', selected.has(item.entryId) ? 'border-primary/40 bg-primary/5' : 'opacity-70')}>
                          <div className="flex items-start gap-3 p-2.5">
                            <Checkbox
                              className="mt-0.5"
                              checked={selected.has(item.entryId)}
                              onCheckedChange={(v) => toggle([item.entryId], !!v)}
                              aria-label={`Week ${item.weekNumber}`}
                            />
                            <button type="button" onClick={() => setExpanded(open ? null : item.entryId)} className="min-w-0 flex-1 text-left">
                              <span className="flex items-center gap-2">
                                <span className="text-sm font-semibold">Week {item.weekNumber}</span>
                                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
                              </span>
                              {!open && <span className="line-clamp-2 text-sm text-muted-foreground">{preview(item.workDone)}</span>}
                            </button>
                          </div>
                          {open && (
                            <div className="border-t px-4 py-3">
                              <JournalText text={item.workDone} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>

        <div className="space-y-2.5 border-t bg-card/60 px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setFeedback((f) => (f.trim() ? `${f.trim()} ${q}` : q))}
                className="rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:bg-muted"
              >
                + {q}
              </button>
            ))}
          </div>
          <Textarea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback for every selected week (optional)…" />
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Final: each student is emailed and each selected week locks.
            </p>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button size="lg" onClick={send} disabled={!count || sending} className="min-w-48">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
              {feedback.trim() ? `Send to ${count} ${count === 1 ? 'week' : 'weeks'}` : `Acknowledge ${count} ${count === 1 ? 'week' : 'weeks'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
