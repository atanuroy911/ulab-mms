'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DevSettings {
  devAllowAnyEmailDomain: boolean;
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
            <li>
              Google sign-in still only offers @ulab.edu.bd accounts on Google&apos;s account picker, so test non-ULAB
              addresses with email/password.
            </li>
            <li>Student check-in, marks and project pages stay ULAB-only.</li>
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
    </div>
  );
}
