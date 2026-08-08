'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { notify } from '@/app/utils/notifications';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, LogOut, Save, User, Mail, Link2, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLinkGoogle = () => {
    setGoogleLoading(true);
    signIn('google', { callbackUrl: '/settings' });
  };

  const [defaultMidWeightage, setDefaultMidWeightage] = useState('25');
  const [defaultFinalWeightage, setDefaultFinalWeightage] = useState('40');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  // Overrides session.user.hasPassword right after a first-time password set,
  // since the JWT session only refreshes this on next login.
  const [justSetPassword, setJustSetPassword] = useState(false);
  const hasPassword = justSetPassword || !!session?.user?.hasPassword;

  useEffect(() => {
    // Load default weightages from localStorage
    const savedMidWeightage = localStorage.getItem('defaultMidWeightage');
    const savedFinalWeightage = localStorage.getItem('defaultFinalWeightage');
    if (savedMidWeightage) setDefaultMidWeightage(savedMidWeightage);
    if (savedFinalWeightage) setDefaultFinalWeightage(savedFinalWeightage);
  }, []);

  const handleSaveDefaultWeightages = () => {
    const mid = parseFloat(defaultMidWeightage);
    const final = parseFloat(defaultFinalWeightage);

    if (isNaN(mid) || isNaN(final)) {
      notify.settings.invalidInput();
      setSettingsError('Please enter valid numbers');
      return;
    }

    if (mid < 0 || final < 0 || mid > 100 || final > 100) {
      notify.settings.invalidWeightage();
      setSettingsError('Weightages must be between 0 and 100');
      return;
    }

    localStorage.setItem('defaultMidWeightage', defaultMidWeightage);
    localStorage.setItem('defaultFinalWeightage', defaultFinalWeightage);
    notify.settings.weightagesSaved();
    setSettingsSuccess('Default weightages saved successfully!');
    setSettingsError('');

    setTimeout(() => setSettingsSuccess(''), 3000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (hasPassword && !currentPassword) {
      setPasswordError('Please enter your current password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        notify.auth.passwordChanged();
        setPasswordSuccess(hasPassword ? 'Password changed successfully!' : 'Password set successfully!');
        setJustSetPassword(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordSuccess(''), 3000);
      } else {
        notify.auth.passwordChangeError(data.error);
        setPasswordError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setPasswordError('An error occurred while changing password');
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md border-b bg-background/80">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <Link href="/dashboard">
                <Image
                  src="/ulab.svg"
                  alt="ULAB Logo"
                  width={50}
                  height={50}
                  className="drop-shadow-lg cursor-pointer shrink-0"
                />
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent truncate">
                  ⚙️ Settings
                </h1>
                <p className="text-xs text-muted-foreground truncate">
                  Manage your preferences
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  notify.auth.signOutSuccess();
                  signOut({ callbackUrl: '/auth/signin' });
                }}
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-4 pt-8">

        {/* Default Weightages */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Default Exam Weightages</CardTitle>
            <CardDescription>
              These values will be used as defaults when creating new Mid-term and Final exams
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsError && (
              <Alert variant="destructive">
                <AlertDescription>{settingsError}</AlertDescription>
              </Alert>
            )}

            {settingsSuccess && (
              <Alert className="border-green-500 bg-green-500/10">
                <AlertDescription className="text-green-600 dark:text-green-400">
                  {settingsSuccess}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mid-weightage">Default Mid-term Weightage (%)</Label>
                <Input
                  id="mid-weightage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={defaultMidWeightage}
                  onChange={(e) => setDefaultMidWeightage(e.target.value)}
                  placeholder="e.g., 30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="final-weightage">Default Final Weightage (%)</Label>
                <Input
                  id="final-weightage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={defaultFinalWeightage}
                  onChange={(e) => setDefaultFinalWeightage(e.target.value)}
                  placeholder="e.g., 50"
                />
              </div>
            </div>

            <Button onClick={handleSaveDefaultWeightages}>
              <Save className="h-4 w-4 mr-2" />
              Save Weightages
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Attendance & Class Settings</CardTitle>
            <CardDescription>
              Attendance class settings are saved per course from the Attendance page, not here.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Open a course, switch to the Attendance tab, then use <span className="font-medium text-foreground">Class Settings</span> to set the room, class time, representative, and student probation flag.
          </CardContent>
        </Card>

        {/* Password Change / Set */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{hasPassword ? 'Change Password' : 'Set Password'}</CardTitle>
            <CardDescription>
              {hasPassword
                ? 'Update your account password'
                : 'Your account currently only signs in with Google. Set a password to also sign in with email.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {passwordError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}

            {passwordSuccess && (
              <Alert className="mb-4 border-green-500 bg-green-500/10">
                <AlertDescription className="text-green-600 dark:text-green-400">
                  {passwordSuccess}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              {hasPassword && (
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-password">{hasPassword ? 'New Password' : 'Password'}</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">{hasPassword ? 'Confirm New Password' : 'Confirm Password'}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
              </div>

              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : hasPassword ? 'Change Password' : 'Set Password'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Linked Accounts */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Linked Accounts</CardTitle>
            <CardDescription>
              Link your ULAB Google account to sign in with Google
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Link2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Google</p>
                  <p className="text-sm text-muted-foreground">
                    {session?.user?.googleLinked
                      ? 'Your ULAB Google account is linked'
                      : 'Not linked yet'}
                  </p>
                </div>
              </div>

              {session?.user?.googleLinked ? (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Linked
                </div>
              ) : (
                <Button variant="outline" onClick={handleLinkGoogle} disabled={googleLoading}>
                  {googleLoading ? 'Redirecting to Google...' : 'Link Google Account'}
                </Button>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Only @ulab.edu.bd Google accounts can be linked, and student accounts are not accepted.
            </p>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Your account details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{session?.user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{session?.user?.name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
