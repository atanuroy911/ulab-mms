'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, LogOut, ArrowLeft, Shield, KeyRound, AlertTriangle, BookOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notify } from '@/app/utils/notifications';

export default function AdminSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [versionLoading, setVersionLoading] = useState(true);
  const [buildVersion, setBuildVersion] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [credentialsLoginEnabled, setCredentialsLoginEnabled] = useState(true);
  const [credentialsLoading, setCredentialsLoading] = useState(true);
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [courseCodeEditableByTeacher, setCourseCodeEditableByTeacher] = useState(true);
  const [courseCodeSettingLoading, setCourseCodeSettingLoading] = useState(true);
  const [courseCodeSettingSaving, setCourseCodeSettingSaving] = useState(false);
  const [showCourseCodeDisableConfirm, setShowCourseCodeDisableConfirm] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/verify');
        const data = await response.json();
        
        if (!data.authenticated) {
          router.push('/admin/signin');
        } else {
          setAuthenticated(true);
        }
      } catch (err) {
        router.push('/admin/signin');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const response = await fetch('/api/version');
        const data = await response.json();
        if (response.ok) {
          setBuildVersion(data.version || 'unknown');
        } else {
          setBuildVersion('unknown');
        }
      } catch {
        setBuildVersion('unknown');
      } finally {
        setVersionLoading(false);
      }
    };

    loadVersion();
  }, []);

  useEffect(() => {
    const loadCredentialsSetting = async () => {
      try {
        const response = await fetch('/api/admin/settings');
        const data = await response.json();
        if (response.ok) {
          setCredentialsLoginEnabled(data.credentialsLoginEnabled);
          setCourseCodeEditableByTeacher(data.courseCodeEditableByTeacher);
        }
      } catch (err) {
        console.error('Error loading sign-in settings:', err);
      } finally {
        setCredentialsLoading(false);
        setCourseCodeSettingLoading(false);
      }
    };

    loadCredentialsSetting();
  }, []);

  const applyCourseCodeEditableSetting = async (next: boolean) => {
    setCourseCodeSettingSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseCodeEditableByTeacher: next }),
      });
      const data = await response.json();
      if (response.ok) {
        setCourseCodeEditableByTeacher(data.courseCodeEditableByTeacher);
        notify.success(
          data.courseCodeEditableByTeacher
            ? 'Teachers can now edit the New/UNESCO code'
            : 'The New/UNESCO code is now admin-only'
        );
      } else {
        notify.error(data.error || 'Failed to update course code setting');
      }
    } catch (err) {
      console.error('Error updating course code setting:', err);
      notify.error('Failed to update course code setting');
    } finally {
      setCourseCodeSettingSaving(false);
      setShowCourseCodeDisableConfirm(false);
    }
  };

  const handleToggleCourseCodeEditable = () => {
    if (courseCodeEditableByTeacher) {
      // Turning it off is the risky direction - confirm first.
      setShowCourseCodeDisableConfirm(true);
    } else {
      applyCourseCodeEditableSetting(true);
    }
  };

  const applyCredentialsLoginSetting = async (nextEnabled: boolean) => {
    setCredentialsSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialsLoginEnabled: nextEnabled }),
      });
      const data = await response.json();
      if (response.ok) {
        setCredentialsLoginEnabled(data.credentialsLoginEnabled);
        notify.success(
          data.credentialsLoginEnabled
            ? 'Email/password sign-in is now enabled for teachers'
            : 'Email/password sign-in is now disabled for teachers'
        );
      } else {
        notify.error(data.error || 'Failed to update sign-in settings');
      }
    } catch (err) {
      console.error('Error updating sign-in settings:', err);
      notify.error('Failed to update sign-in settings');
    } finally {
      setCredentialsSaving(false);
      setShowDisableConfirm(false);
    }
  };

  const handleToggleCredentialsLogin = () => {
    if (credentialsLoginEnabled) {
      // Turning it off is the risky direction - confirm first.
      setShowDisableConfirm(true);
    } else {
      applyCredentialsLoginSetting(true);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/admin/signout', { method: 'POST' });
      notify.auth.signOutSuccess();
      router.push('/admin/signin');
    } catch (err) {
      console.error('Sign out error:', err);
      notify.error('Failed to sign out');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          router.push('/admin/dashboard');
        }, 2000);
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md border-b bg-background/80">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/dashboard">
                <Image
                  src="/ulab.svg"
                  alt="ULAB Logo"
                  width={100}
                  height={100}
                  className="drop-shadow-lg cursor-pointer hover:opacity-80 transition-opacity"
                />
              </Link>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Admin Portal
                </h1>
                <p className="text-xs text-muted-foreground">
                  Settings
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button
                variant="destructive"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto p-4 pt-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push('/admin/dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-purple-600" />
              <div>
                <CardTitle>Change Admin Password</CardTitle>
                <CardDescription className="mt-1">
                  Update your admin password to keep the system secure
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert className="mb-4 bg-destructive/10 border-destructive">
                <AlertDescription className="text-destructive">{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="mb-4 bg-green-100 border-green-400 dark:bg-green-900/20 dark:border-green-800">
                <AlertDescription className="text-green-700 dark:text-green-400">{success}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Current Password */}
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    disabled={submitting}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    disabled={submitting}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={submitting}
                    className="pr-10"
                    minLength={8}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    disabled={submitting}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Must be at least 8 characters long
                </p>
              </div>

              {/* Confirm New Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Changing Password...
                    </>
                  ) : (
                    'Change Password'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Teacher Sign-in Methods */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-6 w-6 text-purple-600" />
              <div>
                <CardTitle>Teacher Sign-in Methods</CardTitle>
                <CardDescription className="mt-1">
                  Control whether teachers can sign in / sign up with an email and password
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Email/Password Sign-in</span>
                  {credentialsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Badge variant={credentialsLoginEnabled ? 'default' : 'secondary'}>
                      {credentialsLoginEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {credentialsLoginEnabled
                    ? 'Teachers can sign in and sign up with email and password, or with Google.'
                    : 'Teachers can only sign in with Google. Existing passwords are kept but cannot be used to sign in.'}
                </p>
              </div>
              <Button
                variant={credentialsLoginEnabled ? 'destructive' : 'default'}
                onClick={handleToggleCredentialsLogin}
                disabled={credentialsLoading || credentialsSaving}
              >
                {credentialsSaving ? 'Saving...' : credentialsLoginEnabled ? 'Turn Off' : 'Turn On'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Course Catalogue Editing */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-purple-600" />
              <div>
                <CardTitle>New/UNESCO Code Editing</CardTitle>
                <CardDescription className="mt-1">
                  Control whether teachers can edit a course&apos;s New Code (the alias code, which is also the UNESCO code from the catalogue) from Course Settings
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Teacher-editable New Code</span>
                  {courseCodeSettingLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Badge variant={courseCodeEditableByTeacher ? 'default' : 'secondary'}>
                      {courseCodeEditableByTeacher ? 'Enabled' : 'Disabled'}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {courseCodeEditableByTeacher
                    ? 'Teachers can turn on aliasing and edit the New Code from Course Settings, as they always could.'
                    : "Course Settings' New Code is locked: it stays whatever the admin catalogue/fixed registry suggested, and teachers can't change it."}
                </p>
              </div>
              <Button
                variant={courseCodeEditableByTeacher ? 'destructive' : 'default'}
                onClick={handleToggleCourseCodeEditable}
                disabled={courseCodeSettingLoading || courseCodeSettingSaving}
              >
                {courseCodeSettingSaving ? 'Saving...' : courseCodeEditableByTeacher ? 'Turn Off' : 'Turn On'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Security Info */}
        <Card className="mt-6 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              Security Tips
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
              <li>Use a strong, unique password that you don &apos t use elsewhere</li>
              <li>Make it at least 8 characters with a mix of letters and numbers</li>
              <li>Change your password regularly for better security</li>
              <li>Never share your admin password with anyone</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div>
              <h3 className="font-semibold">Software Version</h3>
              <p className="text-sm text-muted-foreground">
                Automatically updated on each new build or commit.
              </p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              {versionLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </span>
              ) : (
                <span className="font-mono text-foreground">{buildVersion}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDisableConfirm} onOpenChange={setShowDisableConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <DialogTitle>Turn Off Email/Password Sign-in?</DialogTitle>
            </div>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertDescription>
              <p>Once this is off:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Teachers will no longer be able to sign in with email and password, even if they already have one set.</li>
                <li>New accounts can only be created by signing up with a @ulab.edu.bd Google account.</li>
                <li>Anyone who has not linked a Google account to their existing account will be locked out until you turn this back on or they link Google.</li>
              </ul>
              <p className="mt-2 font-medium">You can turn this back on at any time.</p>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisableConfirm(false)} disabled={credentialsSaving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => applyCredentialsLoginSetting(false)} disabled={credentialsSaving}>
              {credentialsSaving ? 'Turning off...' : 'Turn Off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCourseCodeDisableConfirm} onOpenChange={setShowCourseCodeDisableConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <DialogTitle>Turn Off Teacher-editable New Code?</DialogTitle>
            </div>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertDescription>
              <p>Once this is off:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Teachers will no longer be able to toggle aliasing on/off or edit the New Code from Course Settings.</li>
                <li>The New Code stays whatever the admin course catalogue (or fixed registry) already suggested.</li>
              </ul>
              <p className="mt-2 font-medium">You can turn this back on at any time.</p>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCourseCodeDisableConfirm(false)} disabled={courseCodeSettingSaving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => applyCourseCodeEditableSetting(false)} disabled={courseCodeSettingSaving}>
              {courseCodeSettingSaving ? 'Turning off...' : 'Turn Off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
