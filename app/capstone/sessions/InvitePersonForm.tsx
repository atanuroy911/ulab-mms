'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, MailPlus } from 'lucide-react';
import { toast } from 'sonner';

export interface InvitedUser {
  _id: string;
  name: string;
  email: string;
  invitePending?: boolean;
}

interface Props {
  sessionId: string;
  role: 'supervisor' | 'evaluator';
  /** Shown in the invitation email when the group already exists (evaluator case). */
  projectTitle?: string;
  /** Called with the invited (or already-registered) user so the picker can select them. */
  onInvited: (user: InvitedUser) => void;
}

/**
 * "Not in the list?" link that expands into a name + email form. Inviting creates a pending
 * account the coordinator can assign immediately and emails the person a link to activate it.
 */
export function InvitePersonForm({ sessionId, role, projectTitle, onInvited }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  // Follows the admin "allow any email domain" developer setting, like the server does.
  const [anyDomain, setAnyDomain] = useState(false);
  useEffect(() => {
    fetch('/api/auth/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAnyDomain(data?.devAllowAnyEmailDomain === true))
      .catch(() => {});
  }, []);

  const emailLooksUlab = anyDomain
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    : /^[^\s@]+@ulab\.edu\.bd$/i.test(email.trim());

  const handleInvite = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/capstone/sessions/${sessionId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, projectTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invitation');

      if (data.status === 'existing') {
        toast.info(`${data.user.name} already has an account - selected them`);
      } else if (!data.emailSent) {
        toast.warning(`${data.user.name} was added, but the invitation email could not be sent. Check the mail settings, then invite again to resend.`);
      } else {
        toast.success(
          data.status === 'reinvited'
            ? `Invitation re-sent to ${data.user.email}`
            : `Invitation sent to ${data.user.email}`
        );
      }
      onInvited(data.user);
      setOpen(false);
      setName('');
      setEmail('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-primary hover:underline">
        + Not registered yet? Invite by email
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        They&apos;ll be added right away and emailed a link to set up their account. Inviting someone who was
        already invited sends them a fresh link.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`invite-name-${role}`}>Name</Label>
        <Input id={`invite-name-${role}`} value={name} onChange={(e) => setName(e.target.value)} disabled={sending} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`invite-email-${role}`}>{anyDomain ? 'Email' : 'ULAB email'}</Label>
        <Input
          id={`invite-email-${role}`}
          type="email"
          placeholder="name@ulab.edu.bd"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
        />
        {email.trim() && !emailLooksUlab && (
          <p className="text-xs text-destructive">
            {anyDomain ? 'Enter a valid email address.' : 'Only @ulab.edu.bd addresses can sign in, so only those can be invited.'}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleInvite} disabled={sending || !name.trim() || !emailLooksUlab}>
          {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <MailPlus className="h-4 w-4 mr-1.5" />}
          Invite &amp; Select
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
      </div>
    </div>
  );
}

/**
 * Shown under a supervisor/evaluator picker when the selected person was invited but hasn't
 * set up their account. Re-sends through the same session invite endpoint, which issues a
 * fresh link and invalidates the old one.
 */
export function PendingInviteNote({
  sessionId,
  role,
  projectTitle,
  user,
}: {
  sessionId: string;
  role: 'supervisor' | 'evaluator';
  projectTitle?: string;
  user: InvitedUser | undefined;
}) {
  const [sending, setSending] = useState(false);
  if (!user?.invitePending) return null;

  const resend = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/capstone/sessions/${sessionId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user.name, email: user.email, role, projectTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend invitation');
      if (data.status === 'existing') toast.info(`${user.name} has already set up their account`);
      else if (!data.emailSent) toast.warning('A new link was created, but the email could not be sent. Check the mail settings.');
      else toast.success(`Invitation re-sent to ${user.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend invitation');
    } finally {
      setSending(false);
    }
  };

  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-amber-700 dark:text-amber-300">
      {user.name} hasn&apos;t set up their account yet.
      <button
        type="button"
        onClick={resend}
        disabled={sending}
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <MailPlus className="h-3 w-3" />}
        Resend invite
      </button>
    </p>
  );
}
