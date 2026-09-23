'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface InviteInfo {
  name: string;
  email: string;
  credentialsLoginEnabled: boolean;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Image src="/ulab.svg" alt="ULAB Logo" width={120} height={120} className="h-auto drop-shadow-lg" priority />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Set Up Your Account</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const linkIncomplete = !token || !email;
  const [checking, setChecking] = useState(!linkIncomplete);
  const [fetchError, setFetchError] = useState('');
  const linkError = linkIncomplete
    ? 'This invitation link is incomplete. Open it again from your email.'
    : fetchError;
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (linkIncomplete) return;
    fetch(`/api/auth/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'This invitation link is not valid.');
        setInvite(data);
        setName(data.name);
      })
      .catch((err) => setFetchError(err instanceof Error ? err.message : 'This invitation link is not valid.'))
      .finally(() => setChecking(false));
  }, [token, email, linkIncomplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirmPassword) return setError('Passwords do not match');

    setSaving(true);
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, name, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set up your account');
      setDone(true);
      // Sign straight in and land on the capstone page - that's what they were invited for.
      await signIn('credentials', { email: invite?.email || email, password, callbackUrl: '/capstone' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up your account');
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (linkError || !invite) {
    return (
      <Shell>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3 text-center py-4">
              <div className="flex justify-center">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
              </div>
              <h3 className="font-semibold text-red-700">Invitation Link Not Valid</h3>
              <p className="text-sm text-muted-foreground">{linkError}</p>
              <p className="text-sm text-muted-foreground">
                If you already set up your account, just sign in. Otherwise ask the capstone coordinator to
                resend your invitation.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" asChild>
              <Link href="/auth/signin">Go to Sign In</Link>
            </Button>
          </CardFooter>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {invite.name}</CardTitle>
          <CardDescription>
            You were invited to evaluate capstone projects. Activate your account for{' '}
            <strong className="text-foreground">{invite.email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">{error}</div>
          )}

          {done ? (
            <div className="space-y-3 text-center py-4">
              <div className="flex justify-center">
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <h3 className="font-semibold text-green-700">Account Ready</h3>
              <p className="text-sm text-muted-foreground">Signing you in...</p>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => signIn('google', { callbackUrl: '/capstone' })}
                disabled={saving}
              >
                Continue with Google ({invite.email})
              </Button>

              {invite.credentialsLoginEnabled && (
                <>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="h-px flex-1 bg-border" /> or set a password <div className="h-px flex-1 bg-border" />
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Your name</Label>
                      <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required disabled={saving} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        disabled={saving}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={saving}>
                      {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Setting up...</> : 'Activate Account'}
                    </Button>
                  </form>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
