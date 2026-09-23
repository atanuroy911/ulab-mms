'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Tip } from '@/app/components/Tip';

/**
 * "Remind students" - emails every active member of a group to keep their weekly journal up
 * to date, each with their own submitted/total count. For the group's supervisor and for
 * coordinators; the server enforces both that and a short cooldown against double sends.
 */
export function JournalReminderButton({
  groupId,
  lastSentAt,
  onSent,
  size = 'sm',
  variant = 'outline',
  compact = false,
}: {
  groupId: string;
  lastSentAt?: string | Date | null;
  onSent?: (sentAt: string) => void;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'secondary';
  /** Icon-only, for tight rows. */
  compact?: boolean;
}) {
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!confirm('Email every student in this group a reminder to update their weekly journal?')) return;
    setSending(true);
    try {
      const res = await fetch(`/api/capstone/groups/${groupId}/journal-reminder`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reminders');

      const parts = [`Reminder sent to ${data.sent} student${data.sent === 1 ? '' : 's'}`];
      if (data.failed) parts.push(`${data.failed} failed`);
      if (data.noEmail?.length) parts.push(`${data.noEmail.length} have no email on record`);
      (data.sent > 0 ? toast.success : toast.warning)(parts.join(' · '));
      if (data.sent > 0) onSent?.(new Date().toISOString());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reminders');
    } finally {
      setSending(false);
    }
  };

  const last = lastSentAt ? new Date(lastSentAt) : null;
  const label = `Email each student a reminder to fill in their weekly journal, with how many weeks they've submitted.${
    last ? ` Last sent ${last.toLocaleString()}.` : ''
  }`;

  return (
    <Tip label={label}>
      <Button size={compact ? 'icon' : size} variant={variant} onClick={send} disabled={sending} className={compact ? 'h-8 w-8' : undefined}>
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
        {!compact && <span className="ml-1.5">Remind students</span>}
      </Button>
    </Tip>
  );
}
