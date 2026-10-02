'use client';

import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ReminderGroup {
  _id: string;
  track: string;
  members: Array<{ removedAt?: string | null }>;
  lastJournalReminderAt?: string | null;
}

/**
 * The coordinator's "remind every student to update their weekly journal" - for the whole
 * session or one track. The same email each group's own Remind button sends (with every
 * student's submitted/total weeks), sent in the background.
 */
export function JournalRemindAllDialog({
  open,
  onOpenChange,
  sessionId,
  tracks,
  groups,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  tracks: string[];
  groups: ReminderGroup[];
  /** The groups claimed for this send, with the time - so their "last reminded" updates. */
  onSent?: (sentAt: string, track: string) => void;
}) {
  const [track, setTrack] = useState('all');
  const [sending, setSending] = useState(false);

  const inScope = groups.filter((g) => (track === 'all' || g.track === track) && g.members.some((m) => !m.removedAt));
  const students = inScope.reduce((n, g) => n + g.members.filter((m) => !m.removedAt).length, 0);
  const last = inScope.reduce<number>((t, g) => Math.max(t, g.lastJournalReminderAt ? new Date(g.lastJournalReminderAt).getTime() : 0), 0);

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/capstone/sessions/${sessionId}/journal-reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(track === 'all' ? {} : { track }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reminders');
      toast.success(
        `Sending reminders to ${data.students} student${data.students === 1 ? '' : 's'} in ${data.groups} group${data.groups === 1 ? '' : 's'}` +
          (data.skipped ? ` · ${data.skipped} group${data.skipped === 1 ? '' : 's'} reminded minutes ago, skipped` : '') +
          '. It takes a few minutes; students also see it in their portal.',
        { duration: 9000 }
      );
      onSent?.(data.sentAt, track);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reminders');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" /> Remind students about their journals
          </DialogTitle>
          <DialogDescription>
            Every student gets an email and a portal note asking them to bring their weekly journal up to date, with how many weeks they&apos;ve
            submitted so far.
          </DialogDescription>
        </DialogHeader>

        {tracks.length > 1 && (
          <div className="flex w-fit rounded-lg border p-0.5" role="tablist" aria-label="Which groups">
            {['all', ...tracks].map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={track === t}
                onClick={() => setTrack(t)}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium', track === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {t === 'all' ? 'Every group' : `Capstone ${t}`}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p>
            <strong>{students}</strong> student{students === 1 ? '' : 's'} in <strong>{inScope.length}</strong> group{inScope.length === 1 ? '' : 's'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{last ? `Last reminder to these groups: ${new Date(last).toLocaleString()}` : 'No journal reminder sent to these groups yet.'}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending || students === 0}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
            Send to {students} student{students === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
