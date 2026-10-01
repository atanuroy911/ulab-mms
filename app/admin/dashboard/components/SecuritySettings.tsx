'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Status {
  enabled: boolean;
  enabledAt: string | null;
  backupCodesLeft: number;
  sessionVerified: boolean;
  personal: boolean;
}

async function call(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

/**
 * Authenticator-app 2FA: for the shared admin login (the admin panel's Security page), or a
 * teacher's own account (their Settings page, `personal`).
 */
export default function SecuritySettings({ personal = false }: { personal?: boolean } = {}) {
  const endpoint = personal ? '/api/auth/two-factor' : '/api/admin/two-factor';
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const load = () =>
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => undefined);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (body: Record<string, unknown>, after: (d: Record<string, unknown>) => void) => {
    setBusy(true);
    try {
      after(await call(endpoint, body));
      setCode('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const codeInput = (label: string) => (
    <div className="space-y-1.5">
      <label htmlFor="totp-code" className="text-sm font-medium">
        {label}
      </label>
      <Input
        id="totp-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        className="h-11 w-40 text-center font-mono text-lg tracking-[0.3em]"
      />
    </div>
  );

  if (!status) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {!personal && (
        <div>
          <h2 className="text-2xl font-bold">Security</h2>
          <p className="text-muted-foreground">Two-factor sign-in for the shared admin password.</p>
        </div>
      )}

      {backupCodes && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> Save these backup codes now
            </CardTitle>
            <CardDescription>
              Each works once, in place of an authenticator code - for when the phone is lost. They won&apos;t be shown again. Keep them somewhere safe and
              offline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm sm:grid-cols-4">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(backupCodes.join('\n')).then(() => toast.success('Copied'));
                }}
              >
                <Copy className="mr-1.5 h-4 w-4" /> Copy
              </Button>
              <Button size="sm" onClick={() => setBackupCodes(null)}>
                <Check className="mr-1.5 h-4 w-4" /> I&apos;ve saved them
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {status.enabled ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}
            Authenticator app
            <span
              className={
                status.enabled
                  ? 'ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300'
                  : 'ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300'
              }
            >
              {status.enabled ? 'On' : 'Off'}
            </span>
          </CardTitle>
          <CardDescription>
            {status.enabled
              ? `Signing in with ${personal ? 'your password' : 'the shared admin password'} also asks for a 6-digit code. On since ${status.enabledAt ? new Date(status.enabledAt).toLocaleDateString() : '-'} · ${status.backupCodesLeft} backup codes left.`
              : personal
                ? 'Someone who learns your password can sign in as you. Turn this on so your password alone is not enough. (Signing in with Google uses your Google account’s own security.)'
                : 'Anyone who learns the shared password can sign in. Turn this on so the password alone is not enough - and to let the shared login grant admin and coordinator roles.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!status.enabled && !setup && (
            <Button disabled={busy} onClick={() => run({ action: 'setup' }, (d) => setSetup(d as { qr: string; secret: string }))}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
              Set up authenticator
            </Button>
          )}

          {!status.enabled && setup && (
            <div className="space-y-5">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                <li>Open Google Authenticator, Microsoft Authenticator or Authy on your phone.</li>
                <li>Add an account and scan this code.{personal ? '' : ' Everyone who shares the admin login scans the same code.'}</li>
                <li>Enter the 6-digit code it shows.</li>
              </ol>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qr} alt="QR code for the authenticator app" width={200} height={200} className="rounded-lg border bg-white p-2" />
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">Can&apos;t scan? Enter this key:</p>
                  <p className="break-all font-mono font-semibold">{setup.secret}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {codeInput('Code from the app')}
                <Button
                  className="h-11"
                  disabled={busy || code.length !== 6}
                  onClick={() =>
                    run({ action: 'enable', code }, (d) => {
                      setSetup(null);
                      setBackupCodes(d.backupCodes as string[]);
                      toast.success('Two-factor sign-in is on');
                    })
                  }
                >
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Turn on
                </Button>
                <Button variant="ghost" className="h-11" onClick={() => setSetup(null)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {status.enabled && !status.sessionVerified && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              This session signed in without a code. Sign out and back in with your authenticator code to manage these settings or change account roles.
            </p>
          )}

          {status.enabled && (status.sessionVerified || status.personal) && (
            <div className="space-y-4">
              {!status.personal && codeInput('Current code (needed for the actions below)')}
              <div className="flex flex-wrap gap-2">
                {!status.personal && (
                  <Button
                    variant="outline"
                    disabled={busy || code.length !== 6}
                    onClick={() => run({ action: 'backup-codes', code }, (d) => setBackupCodes(d.backupCodes as string[]))}
                  >
                    <KeyRound className="mr-2 h-4 w-4" /> New backup codes
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={busy || (!status.personal && code.length !== 6)}
                  onClick={() => {
                    if (!confirm(personal ? 'Turn off two-factor sign-in? Your password alone will sign in again.' : 'Turn off two-factor sign-in? The shared password alone will sign in again, and it can no longer change roles.')) return;
                    run({ action: 'disable', code }, () => toast.success('Two-factor sign-in is off'));
                  }}
                >
                  Turn off
                </Button>
              </div>
              {status.personal && (
                <p className="text-xs text-muted-foreground">You&apos;re signed in with your own admin account, so you can turn this off without a code (for a lost phone).</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
