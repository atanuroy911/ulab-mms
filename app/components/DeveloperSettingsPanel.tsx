'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DevSettings {
  devAllowAnyEmailDomain: boolean;
  devStudentTestEmails: string[];
  updatedAt: string | null;
  /** null when changed from the /admin panel's shared login, which has no user identity. */
  updatedBy: { name?: string; email?: string } | null;
}

/**
 * Developer switches, shown both to admin-role teacher accounts (/dashboard/developer) and in
 * the /admin panel's "Developer Settings" tab. /api/dev-settings accepts either login.
 */
export function DeveloperSettingsPanel() {
  const [settings, setSettings] = useState<DevSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/dev-settings')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load developer settings');
        setSettings(data);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load developer settings'));
  }, []);

  // Student test addresses: edited as one address per line, saved as a list.
  const [studentEmailsText, setStudentEmailsText] = useState<string | null>(null);
  const [savingStudentEmails, setSavingStudentEmails] = useState(false);
  const studentEmailsDraft = studentEmailsText ?? (settings?.devStudentTestEmails || []).join('\n');

  /** Saves the typed list, or `override` (e.g. [] for "Remove all"). */
  const saveStudentEmails = async (override?: string[]) => {
    const emails = override ?? studentEmailsDraft.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    setSavingStudentEmails(true);
    try {
      const res = await fetch('/api/dev-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devStudentTestEmails: emails }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setSettings(data);
      setStudentEmailsText(null);
      toast.success(
        data.devStudentTestEmails.length
          ? `${data.devStudentTestEmails.length} student test address${data.devStudentTestEmails.length === 1 ? '' : 'es'} allowed`
          : 'Student sign-in is ULAB-only again'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingStudentEmails(false);
    }
  };

  const setAnyEmail = async (value: boolean) => {
    if (
      value &&
      !confirm(
        'Lift the @ulab.edu.bd restriction?\n\nAnyone with any email address will be able to sign up and sign in as a teacher until you turn this off. Use it for testing only.'
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/dev-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devAllowAnyEmailDomain: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setSettings(data);
      toast.success(value ? 'Email restriction lifted' : 'Email restriction restored');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          These switches loosen safeguards so the app can be tested. They apply to everyone using this deployment,
          not just you. Turn them off again when you&apos;re done.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Allow any email domain</CardTitle>
            {settings && (
              <Badge variant={settings.devAllowAnyEmailDomain ? 'destructive' : 'secondary'}>
                {settings.devAllowAnyEmailDomain ? 'On - restriction lifted' : 'Off'}
              </Badge>
            )}
          </div>
          <CardDescription>
            Normally only @ulab.edu.bd addresses can sign up, sign in, or be invited as supervisors and evaluators.
            When this is on, teacher accounts can use any email - handy for testing invites and sign-up with
            personal inboxes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Affects email/password sign-up and sign-in, and capstone invitations.</li>
            <li>Teacher &quot;Continue with Google&quot; also offers outside accounts while this is on.</li>
            <li>Student sign-ins are not affected - use &quot;Student test accounts&quot; below for those.</li>
            <li>Non-ULAB accounts created while this is on can no longer sign in once it&apos;s turned off.</li>
          </ul>

          {!settings ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={settings.devAllowAnyEmailDomain ? 'default' : 'destructive'}
                onClick={() => setAnyEmail(!settings.devAllowAnyEmailDomain)}
                disabled={saving}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {settings.devAllowAnyEmailDomain ? 'Restore ULAB-only restriction' : 'Lift email restriction'}
              </Button>
              {settings.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Last changed {new Date(settings.updatedAt).toLocaleString()} by{' '}
                  {settings.updatedBy ? settings.updatedBy.name || settings.updatedBy.email : 'the admin panel'}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Student test accounts</CardTitle>
            {settings && (
              <Badge variant={settings.devStudentTestEmails.length ? 'destructive' : 'secondary'}>
                {settings.devStudentTestEmails.length
                  ? `${settings.devStudentTestEmails.length} outside address${settings.devStudentTestEmails.length === 1 ? '' : 'es'} allowed`
                  : 'Off - ULAB only'}
              </Badge>
            )}
          </div>
          <CardDescription>
            Let specific outside Google accounts use the student sign-ins - student portal, marks, attendance
            check-in and project registration - so they can be tested without a ULAB student account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Only the exact addresses listed here are let in, not every outside account. Students are recognised by
              the student ID in their Google display name, which any outside account can set - an open door would let
              anyone view a real student&apos;s records.
            </li>
            <li>
              Give each test account a display name with a test student&apos;s ID, e.g. <span className="font-mono">Test Student (2021-1-60-999)</span>,
              and make sure that ID exists in the course or capstone group you are testing.
            </li>
            <li>While any address is listed, Google&apos;s account picker on student pages shows all accounts.</li>
          </ul>
          {!settings ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <textarea
                value={studentEmailsDraft}
                onChange={(e) => setStudentEmailsText(e.target.value)}
                rows={4}
                placeholder={'tester1@gmail.com\ntester2@gmail.com'}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/50"
                disabled={savingStudentEmails}
                aria-label="Student test email addresses, one per line"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => saveStudentEmails()} disabled={savingStudentEmails || studentEmailsText === null}>
                  {savingStudentEmails && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save test addresses
                </Button>
                {settings.devStudentTestEmails.length > 0 && (
                  <Button
                    variant="outline"
                    disabled={savingStudentEmails}
                    onClick={() => saveStudentEmails([])}
                  >
                    Remove all
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">One address per line, up to 20.</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
